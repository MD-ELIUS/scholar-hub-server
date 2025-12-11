const express = require('express')
const cors = require('cors') ;
const app = express() ;
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const port = process.env.PORT || 3000


//middleware
app.use(express.json()) ;
app.use(cors()) ;


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vm94rma.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('scholar_hub_db')
     const usersCollection = db.collection('users') ;
    const scholarshipsCollection = db.collection('scholarships')

     

    // users related apis

     app.post("/users", async (req, res) => {
      const user = req.body ;
      user.role = 'student' ;
      user.createdAt = new Date() ;
      const email = user.email ;
      const userExists = await usersCollection.findOne({email}) ;

      if(userExists) {
        return res.send({ message: 'user already exist'})
      }
      const result = await usersCollection.insertOne(user) ;
      res.send(result) ;
    })


    // Inside your run() function after defining usersCollection
app.patch("/users/update/:email", async (req, res) => {
  const email = req.params.email;
  const { displayName, photoURL } = req.body;

  try {
    // Update only displayName and photoURL
    const result = await usersCollection.findOneAndUpdate(
      { email }, // filter by email
      { $set: { displayName, photoURL } }, // only these fields
      { returnDocument: "after" } // return updated document
    );

    if (!result.value) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({ message: "Profile updated successfully", user: result.value });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error", error: err.message });
  }
});



    // scholarship api
    app.get('/scholarships', async (req, res) => {

    })

    app.post('/scholarships', async (req, res) => {
        const scholarship = req.body;
        const result = await scholarshipsCollection.insertOne(scholarship) ;
        res.send(result)
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('scholar hub api starting')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})



