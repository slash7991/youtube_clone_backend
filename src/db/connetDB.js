import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connetDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URL}/${DB_NAME}`
    );
    console.log(
      `\n MongoDB connected successfully || DB HOST: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("====================================");
    console.log("MongoDB connection error: ", error);
    console.log("====================================");
    process.exit(1);
  }
};
export default connetDB;
