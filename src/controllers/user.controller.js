import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
const generateAccessTokenAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accesstoken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accesstoken, refreshToken };
  } catch (error) {
    throw new ApiError(500, `Internal server error ${error}`);
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  const { fullname, username, email, password } = req.body;

  // validation - not empty
  if (
    [fullname, username, email, password].some(
      (field) =>
        field?.trim() === "" ||
        field?.trim() === null ||
        field?.trim() === undefined
    )
  ) {
    throw new ApiError(400, "all datas are required");
  }

  //  check user is already exists - usesname & email

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  // check for images , check for avatar
  console.log(req.files);
  const avatarLocalPath =
    req.files?.avtar && Array.isArray(req.files?.avtar)
      ? req.files?.avtar[0]?.path
      : null;
  const coverImageLocalPath =
    req.files?.coverImage && Array.isArray(req.files?.coverImage)
      ? req.files?.coverImage[0]?.path
      : null;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }
  // upload them on cloudinary , avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = coverImageLocalPath
    ? await uploadOnCloudinary(coverImageLocalPath)
    : null;

  if (!avatar) {
    throw new ApiError(400, "Avatar is required");
  }
  // crate user object - create entry in db

  const user = await User.create({
    fullname,
    avatar: avatar?.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  // remove password and refreash token from response
  const createdUser = await User.findById(user?._id).select(
    " -password -refreshToken"
  );
  //check for user creation
  if (!createdUser) {
    throw new ApiError(500, "something went wrong while user created");
  }

  // return res
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "user registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // get login details from frontend
  const { email, password } = req.body;
  console.log(email, password);
  // validation - not empty
  if (
    [email, password].some((field) => field.trim() === "" || field === null)
  ) {
    throw new ApiError(400, "email and password are required");
  }
  // check email exists
  const user = await User.findOne({
    $or: [{ email }, { password }],
  });

  if (!user) {
    throw new ApiError(401, "User not found");
  }
  // compare password
  if (!(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid Password");
  }
  console.log(user);
  // generate accesstoken and refresh token
  const { accesstoken, refreshToken } =
    await generateAccessTokenAndRefreshToken(user._id);

  const logedInUser = await User.findById(user._id).select(
    " -password -refreshToken"
  );
  // return cookie and response

  const option = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accesstoken, option)
    .cookie("refreshToken", refreshToken, option)
    .json(
      new ApiResponse(
        200,
        { user: logedInUser, accesstoken, refreshToken },
        "login successful"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const option = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", option)
    .clearCookie("refreshToken", option)
    .json(new ApiResponse(200, {}, "logout successful"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreashToken =
      req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreashToken) {
      throw new ApiError(401, "refresh token is required");
    }

    const decodedToken = jwt.verify(
      incomingRefreashToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    if (!decodedToken) {
      throw new ApiError(401, "invalid refresh token");
    }
    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "invalid refresh token");
    }

    if (incomingRefreashToken !== user?.refreshToken) {
      throw new ApiError(401, "invalid refresh token");
    }
    const { accesstoken, newRefreashToken } =
      await generateAccessTokenAndRefreshToken(user?._id);

    const option = {
      httpOnly: true,
      secure: true,
    };

    return res
      .status(200)
      .cookie("accessToken", accesstoken, option)
      .cookie("refreshToken", newRefreashToken, option)
      .json(
        new ApiResponse(
          200,
          { accesstoken, refreshToken: newRefreashToken },
          "access token refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "invalid refresh token");
  }
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(401, "user not found");

  if (!(await user.isPasswordCorrect(oldPassword))) {
    throw new ApiError(401, "old password is not correct");
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = req.body?.user;
  if (!user) {
    throw new ApiError(401, "user not found");
  }
  return res.status(200).json(new ApiResponse(200, { user }, "user found"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "fullname and email are required");
  }

  const user = await User.findByIdAndUpdate(
    req?.user?._id,
    {
      $set: {
        fullname,
        email,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(
      new ApiResponse(200, { user }, "account details updated successfully")
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatar = req.file?.path;
  if (!avatar) {
    throw new ApiError(400, "avatar is required");
  }
  const updatedAvatarLocalPath = avatar[0].path;
  if (!updatedAvatarLocalPath) {
    throw new ApiError(400, "avatar is required");
  }
  const updatedAvatar = await uploadOnCloudinary(updatedAvatarLocalPath);
  if (!updatedAvatar) {
    throw new ApiError(500, "unable to upload the image ");
  }
  const user = await User.findByIdAndUpdate(
    req.body?._id,
    {
      $set: {
        avatar: updatedAvatar,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  res.status(200).json(200, { user }, "avatar updated successfully");
});
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImage = req.file?.path;
  if (!coverImage) {
    throw new ApiError(400, "avatar is required");
  }

  if (!coverImage) {
    throw new ApiError(400, "avatar is required");
  }
  const updatedCoverImage = await uploadOnCloudinary(coverImage);
  if (!updatedCoverImage) {
    throw new ApiError(500, "unable to upload the image ");
  }
  const user = await User.findByIdAndUpdate(
    req.body?._id,
    {
      $set: {
        coverImage: updatedCoverImage,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  res.status(200).json(200, { user }, "cover image updated successfully");
});
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changePassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
