import dotenv from "dotenv";
import connetDB from "./db/connetDB.js";
import { app } from "./app.js";

dotenv.config({
  path: "./.env",
});

const port = process.env.PORT || 5000;
connetDB()
  .then(() => {
    app.on("error", (err) => {
      console.log("Server error: ", err);
      throw err;
      //   process.exit(1);
    });
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.log("mongodb connection failed:::", err);
  });
