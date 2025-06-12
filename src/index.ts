import  express  from "express";
import dotenv from "dotenv";
import { identify } from "./controllers/identifyController";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());    

app.get("/", (req, res) => {
    res.send("bitespeed API is running!");
});
app.post("/identify", identify);
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});