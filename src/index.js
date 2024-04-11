import dotenv from "dotenv";
import connetDB from "./db/connetDB.js";

dotenv.config({
  path: "/env",
});

connetDB();
