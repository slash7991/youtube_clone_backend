import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

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

export { registerUser };
