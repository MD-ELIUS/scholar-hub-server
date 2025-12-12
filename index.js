const express = require('express')
const cors = require('cors') ;
const app = express() ;
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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

    // Get all users
app.get("/users", async (req, res) => {
  const search = req.query.search || "";
  const role = req.query.role || "";

  let filter = {
    $or: [
      { displayName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    ]
  };

  if (role) filter.role = role;

  const users = await usersCollection.find(filter).toArray();
  res.send(users);
});


       app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })



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


    app.patch("/users/:id/role", async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );
  res.send(result);
});

app.delete("/users/:id", async (req, res) => {
  const result = await usersCollection.deleteOne({
    _id: new ObjectId(req.params.id)
  });
  res.send(result);
});



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
  try {
    const { search = "", scholarshipCategory, subjectCategory, country } = req.query;

    // Search conditions
    const searchConditions = [
      { scholarshipName: { $regex: search, $options: "i" } },
      { universityName: { $regex: search, $options: "i" } },
      { degree: { $regex: search, $options: "i" } },
    ];

    // Filter conditions
    const filterConditions = [];
    if (scholarshipCategory) filterConditions.push({ scholarshipCategory });
    if (subjectCategory) filterConditions.push({ subjectCategory });
    if (country) filterConditions.push({ country: { $regex: country, $options: "i" } });

    // Combine
    const filter = {
      $and: [
        { $or: searchConditions },
        ...filterConditions
      ]
    };

    // Fetch scholarships sorted by postDate descending
    const scholarships = await scholarshipsCollection
      .find(filter)
      .sort({ postDate: -1 }) // latest first
      .toArray();

    res.send(scholarships);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch scholarships", error: err.message });
  }
});




  app.post('/scholarships', async (req, res) => {
  const scholarship = req.body;
  // postDate already set in frontend, backend can trust it
  const result = await scholarshipsCollection.insertOne(scholarship);
  res.send(result);
});




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



