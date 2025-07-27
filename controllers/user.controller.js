import {User} from "../models/user.model.js";
import bcrypt from "bcryptjs";
import {generateToken} from "../utils/generateToken.js";
import {deleteMediaFromCloudinary, uploadMedia} from "../utils/cloudinary.js";
import {catchAsync} from "../middleware/error.middleware.js";
import {AppError} from "../middleware/error.middleware.js";
import crypto from "crypto";

/**
 * Create a new user account
 * @route POST /api/v1/users/signup
 */
export const createUserAccount = catchAsync(async (req, res, next) => {
  const {name, email, password} = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({email});
  if (existingUser) {
    return next(new AppError("User already exists with this email", 400));
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create new user
  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
  });

  // Generate token
  const token = generateToken(newUser._id);

  // Remove password from response
  newUser.password = undefined;

  // Set cookie
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.status(201).json({
    status: "success",
    message: "Account created successfully",
    data: {
      user: newUser,
      token,
    },
  });
});

/**
 * Authenticate user and get token
 * @route POST /api/v1/users/signin
 */
export const authenticateUser = catchAsync(async (req, res, next) => {
  const {email, password} = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }

  // Find user and include password field
  const user = await User.findOne({email}).select("+password");
  if (!user) {
    return next(new AppError("Invalid email or password", 401));
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError("Invalid email or password", 401));
  }

  // Generate token
  const token = generateToken(user._id);

  // Remove password from response
  user.password = undefined;

  // Set cookie
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.status(200).json({
    status: "success",
    message: "Logged in successfully",
    data: {
      user,
      token,
    },
  });
});

/**
 * Sign out user and clear cookie
 * @route POST /api/v1/users/signout
 */
export const signOutUser = catchAsync(async (_, res) => {
  // Clear the authentication cookie
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
});

/**
 * Get current user profile
 * @route GET /api/v1/users/profile
 */
export const getCurrentUserProfile = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  // Get user profile with enrolled courses
  const user = await User.findById(userId).populate({
    path: "enrolledCourses",
    select: "title description thumbnail price instructor",
    populate: {
      path: "instructor",
      select: "name email",
    },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      user,
    },
  });
});

/**
 * Update user profile
 * @route PATCH /api/v1/users/profile
 */
export const updateUserProfile = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const {name, email, photoUrl} = req.body;

  // Check if email is being changed and if it already exists
  if (email) {
    const existingUser = await User.findOne({
      email,
      _id: {$ne: userId},
    });
    if (existingUser) {
      return next(new AppError("Email already exists", 400));
    }
  }

  // Prepare update data
  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;

  // Handle profile photo upload
  if (photoUrl) {
    // Delete old photo if exists
    const currentUser = await User.findById(userId);
    if (currentUser.photoUrl) {
      await deleteMediaFromCloudinary(currentUser.photoUrl);
    }

    // Upload new photo
    const uploadResult = await uploadMedia(photoUrl);
    updateData.photoUrl = uploadResult.secure_url;
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully",
    data: {
      user: updatedUser,
    },
  });
});

/**
 * Change user password
 * @route PATCH /api/v1/users/password
 */
export const changeUserPassword = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const {currentPassword, newPassword} = req.body;

  // Validate input
  if (!currentPassword || !newPassword) {
    return next(
      new AppError("Please provide current password and new password", 400)
    );
  }

  // Get user with password
  const user = await User.findById(userId).select("+password");
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password
  );
  if (!isCurrentPasswordValid) {
    return next(new AppError("Current password is incorrect", 400));
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedNewPassword = await bcrypt.hash(newPassword, salt);

  // Update password
  user.password = hashedNewPassword;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password changed successfully",
  });
});

/**
 * Request password reset
 * @route POST /api/v1/users/forgot-password
 */
export const forgotPassword = catchAsync(async (req, res, next) => {
  const {email} = req.body;

  // Find user by email
  const user = await User.findOne({email});
  if (!user) {
    return next(new AppError("User not found with this email", 404));
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Hash token and set expiry (10 minutes)
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save({validateBeforeSave: false});

  // Create reset URL
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    // In a real application, you would send an email here
    // For now, we'll just return the reset URL (remove this in production)
    res.status(200).json({
      status: "success",
      message: "Password reset token sent to email",
      resetUrl, // Remove this line in production
      data: {
        resetToken, // Remove this line in production
      },
    });
  } catch (error) {
    // Clear reset token if email sending fails
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({validateBeforeSave: false});

    return next(new AppError("Error sending password reset email", 500));
  }
});

/**
 * Reset password
 * @route POST /api/v1/users/reset-password/:token
 */
export const resetPassword = catchAsync(async (req, res, next) => {
  const {token} = req.params;
  const {password} = req.body;

  if (!password) {
    return next(new AppError("Please provide new password", 400));
  }

  // Hash the token to compare with stored token
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Find user with valid reset token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: {$gt: Date.now()},
  });

  if (!user) {
    return next(new AppError("Token is invalid or has expired", 400));
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Update password and clear reset token
  user.password = hashedPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Generate new JWT token
  const jwtToken = generateToken(user._id);

  // Set cookie
  res.cookie("token", jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.status(200).json({
    status: "success",
    message: "Password reset successfully",
    data: {
      token: jwtToken,
    },
  });
});

/**
 * Delete user account
 * @route DELETE /api/v1/users/account
 */
export const deleteUserAccount = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const {password} = req.body;

  // Verify password before deletion
  if (!password) {
    return next(
      new AppError(
        "Please provide your password to confirm account deletion",
        400
      )
    );
  }

  // Get user with password
  const user = await User.findById(userId).select("+password");
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError("Incorrect password", 400));
  }

  // Delete user's profile photo from cloudinary if exists
  if (user.photoUrl) {
    await deleteMediaFromCloudinary(user.photoUrl);
  }

  // Delete user account
  await User.findByIdAndDelete(userId);

  // Clear authentication cookie
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  res.status(200).json({
    status: "success",
    message: "Account deleted successfully",
  });
});
