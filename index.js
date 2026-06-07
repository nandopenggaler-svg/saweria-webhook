const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {

    res.json({
        status: "online",
        universeId: process.env.UNIVERSE_ID,
        datastore: process.env.DATASTORE_NAME,
        apiKeyExists: !!process.env.ROBLOX_API_KEY
    });

});

app.post("/saweria", (req, res) => {

    console.log("DONASI MASUK");
    console.log(req.body);

    console.log("Universe:", process.env.UNIVERSE_ID);
    console.log("DataStore:", process.env.DATASTORE_NAME);
    console.log("API Key Ada:", !!process.env.ROBLOX_API_KEY);

    res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
