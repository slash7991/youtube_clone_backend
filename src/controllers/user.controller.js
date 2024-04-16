import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

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
export { registerUser, loginUser };
