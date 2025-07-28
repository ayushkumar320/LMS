import jwt from "jsonwebtoken";

// Function to generate a JWT token and set it as an HTTP-only cookie
export const generateToken = (res, user, message) => {
  // Sign the JWT token with the user's ID and a secret from environment variables
  // The token expires in 1 day
  const token = jwt.sign({userId: user._id}, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

  // Set the token as an HTTP-only cookie in the response
  return res
    .status(200)
    .cookie("token", token, {
      httpOnly: true, // Makes the cookie inaccessible to client-side JavaScript
      secure: process.env.NODE_ENV !== "development", // Send cookie only over HTTPS in production
      sameSite: "strict", // Prevents CSRF attacks by ensuring cookie is sent only for same-site requests
      maxAge: 24 * 60 * 60 * 1000, // Cookie expiration time in milliseconds (1 day)
    })
    // Send a JSON response indicating success, a message, and the user object
    .json({
      success: true,
      message,
      user,
    });
};
