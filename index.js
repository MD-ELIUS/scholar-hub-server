const express = require('express')
const cors = require('cors') ;
const app = express() ;
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET)

const port = process.env.PORT || 3000


//middleware
app.use(express.json()) ;
app.use(cors()) ;

//JWT MIDDLEWARE

const verifyJWTToken = (req, res, next) => {
    //  console.log('in middleware', req.headers) ;
      if(!req.headers.authorization) {
        //do not allow to go
        return res.status(401).send({message: 'unauthorized access'})
    }

    const token = req.headers.authorization.split(' ')[1]

    if(!token) {
        return res.status(401).send({message: 'unauthorized access' })
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if(err) {
            return res.status(401).send({message: 'unauthorized access' })
        }
         req.decoded = decoded; // ✅ whole decoded object
        //   console.log('after decoded', decoded)
           req.token_email = decoded.email
         next()
    })

    
}


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
    const applicationsCollection = db.collection('applications');
    const reviewsCollection = db.collection('reviews');


    //JWT Related APIs
      app.post('/getToken', (req, res) => {
        const loggedUser = req.body ;
        const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {expiresIn: '1h'})
        console.log(token)
        res.send({token: token})
    })

     // middle admin before allowing admin activity
        // must be used after verifyFBToken middleware
        const verifyAdmin = async (req, res, next) => {
           const email = req.decoded.email;
            const query = { email };
            const user = await usersCollection.findOne(query);

            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }

            next();
        }

     // Verify Moderator only

                 const verifyModerator = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email };
            const user = await usersCollection.findOne(query);

            if (!user || user.role !== 'moderator') {
                return res.status(403).send({ message: 'forbidden access' });
            }

            next();
        }
 

        // Verify Admin or Moderator
        
        const verifyAdminOrModerator = async (req, res, next) => {
  const email = req.decoded.email;

  const user = await usersCollection.findOne({ email });

  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    return res.status(403).send({ message: "forbidden access" });
  }

  next();
};



     

    // users related apis

    // Get all users
app.get("/users", verifyJWTToken, async (req, res) => {
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


       app.get('/users/:email/role', verifyJWTToken, async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })



     app.post("/users",  async (req, res) => {
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


    app.patch("/users/:id/role", verifyJWTToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );
  res.send(result);
});

app.delete("/users/:id", verifyJWTToken, async (req, res) => {
  const result = await usersCollection.deleteOne({
    _id: new ObjectId(req.params.id)
  });
  res.send(result);
});



    // Inside your run() function after defining usersCollection
app.patch("/users/update/:email", verifyJWTToken, async (req, res) => {
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
app.get('/scholarships',  async (req, res) => {
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


// Get single scholarship by ID
app.get("/scholarships/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Validate ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid scholarship ID" });
    }

    const scholarship = await scholarshipsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!scholarship) {
      return res.status(404).send({ message: "Scholarship not found" });
    }

    res.send(scholarship);

  } catch (err) {
    res.status(500).send({
      message: "Failed to fetch scholarship",
      error: err.message,
    });
  }
});





  app.post('/scholarships', async (req, res) => {
  const scholarship = req.body;
  // postDate already set in frontend, backend can trust it
  const result = await scholarshipsCollection.insertOne(scholarship);
  res.send(result);
});



// Update a scholarship by ID
app.patch("/scholarships/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;

    // Only allow certain fields to be updated (security)
    const allowedFields = [
      "scholarshipName",
      "universityName",
      "country",
      "city",
      "worldRank",
      "degree",
      "subjectCategory",
      "scholarshipCategory",
      "tuitionFees",
      "applicationFees",
      "serviceCharge",
      "totalAmount",
      "deadline",
      "image",
      "postDate",
      "userEmail",
    ];

    const updateFields = {};
    allowedFields.forEach((field) => {
      if (updatedData[field] !== undefined) {
        updateFields[field] = updatedData[field];
      }
    });

    const result = await scholarshipsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Scholarship not found" });
    }

    res.send({ message: "Scholarship updated successfully", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update scholarship", error: err.message });
  }
});



// Delete a scholarship by ID
app.delete("/scholarships/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await scholarshipsCollection.deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Scholarship not found" });
    }

    res.send({ message: "Scholarship deleted successfully", deletedCount: result.deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete scholarship", error: err.message });
  }
});

// GET all applications (moderators/admins only)
app.get("/applications/all", verifyJWTToken,  verifyAdminOrModerator, async (req, res) => {
  try {
    const search = req.query.search || "";

    const searchConditions = [
      { scholarshipName: { $regex: search, $options: "i" } },
      { universityName: { $regex: search, $options: "i" } },
      { degree: { $regex: search, $options: "i" } },
      { userName: { $regex: search, $options: "i" } },
      { userEmail: { $regex: search, $options: "i" } },
    ];

    const filter = search ? { $or: searchConditions } : {};

    const applications = await applicationsCollection
      .find(filter)
      .sort({ applicationDate: -1 })
      .toArray();

    res.send(applications);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch applications", error: err.message });
  }
});



// Get all applications for a student (My Applications)
app.get("/applications", async (req, res) => {
  try {
    const userEmail = req.query.userEmail;
    const search = req.query.search || "";

    if (!userEmail) {
      return res.status(400).send({ message: "Missing userEmail query parameter" });
    }

    // Search conditions for scholarshipName, universityName, degree
    const searchConditions = [
      { scholarshipName: { $regex: search, $options: "i" } },
      { universityName: { $regex: search, $options: "i" } },
      { degree: { $regex: search, $options: "i" } },
    ];

    const filter = {
      userEmail,
      $or: searchConditions,
    };

    // Fetch applications sorted by applicationDate descending
    const applications = await applicationsCollection
      .find(filter)
      .sort({ applicationDate: -1 })
      .toArray();

    res.send(applications);
  } catch (error) {
    console.error("Failed to fetch applications:", error);
    res.status(500).send({ message: "Failed to fetch applications", error: error.message });
  }
});



// Check if user has already applied for a scholarship
app.get('/applications/check', async (req, res) => {
  try {
    const { scholarshipId, userEmail } = req.query;

    if (!scholarshipId || !userEmail) {
      return res.status(400).send(null);
    }

    const application = await applicationsCollection.findOne({
      scholarshipId,
      userEmail
    });

    // returns null if no application exists
    res.send(application || null);
  } catch (error) {
    console.error(error);
    res.status(500).send(null);
  }
});



app.post('/applications',  async (req, res) => {
  try {
    const application = req.body;

    const { scholarshipId, userEmail } = application;

    // 🔍 Step 1: check existing application
    const existingApplication = await applicationsCollection.findOne({
      scholarshipId,
      userEmail

    });

    if (existingApplication) {
      return res.status(409).send({
        message: 'You already applied for this scholarship'
      });
    }

    // 🔹 Step 2: default fields
    application.applicationStatus = 'pending';
    application.paymentStatus = 'unpaid';
    application.applicationDate = new Date();

    // 🔹 Step 3: insert application
    const result = await applicationsCollection.insertOne(application);

    res.send({
      message: 'Application submitted successfully',
      insertedId: result.insertedId
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Failed to apply scholarship' });
  }
});


// Update application status
app.patch("/applications/:id/status", verifyJWTToken, verifyModerator,  async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).send({ message: "Status is required" });
    }

    const result = await applicationsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          applicationStatus: status,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Application not found" });
    }

    res.send({
      success: true,
      message: "Application status updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to update application status",
    });
  }
});


// Update application feedback (Moderator/Admin)
app.patch("/applications/:id/feedback", verifyJWTToken, verifyModerator, async (req, res) => {
  try {
    const id = req.params.id;
    const { feedback } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid application ID" });
    }

    if (!feedback) {
      return res.status(400).send({ message: "Feedback is required" });
    }

    const result = await applicationsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          feedback: feedback,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Application not found" });
    }

    res.send({
      success: true,
      message: "Feedback submitted successfully",
    });
  } catch (error) {
    console.error("Feedback update error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to submit feedback",
      error: error.message,
    });
  }
});



// DELETE an application by ID
app.delete('/applications/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Validate ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid application ID' });
    }

    const result = await applicationsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: 'Application not found' });
    }

    res.send({
      message: 'Application deleted successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Failed to delete application:', error);
    res.status(500).send({ message: 'Failed to delete application', error: error.message });
  }
});

// GET all reviews of a user
app.get("/reviews", async (req, res) => {
  const { userEmail } = req.query;

  if (!userEmail) {
    return res.status(400).send([]);
  }

  const reviews = await reviewsCollection
    .find({ userEmail })
    .toArray();

  res.send(reviews);
});

// GET all reviews (Admin / Moderator)
// GET all reviews (Admin / Moderator)
app.get("/reviews/all", async (req, res) => {
  try {
    const search = req.query.search || "";

    const searchConditions = [
      { userName: { $regex: search, $options: "i" } },
      { userEmail: { $regex: search, $options: "i" } },
      { scholarshipName: { $regex: search, $options: "i" } }, // ✅ ADD THIS
      { universityName: { $regex: search, $options: "i" } },
      { reviewComment: { $regex: search, $options: "i" } },
    ];

    const filter = search ? { $or: searchConditions } : {};

    const reviews = await reviewsCollection
      .find(filter)
      .sort({ reviewDate: -1 })
      .toArray();

    res.send(reviews);
  } catch (err) {
    res.status(500).send({
      message: "Failed to fetch reviews",
      error: err.message,
    });
  }
});



app.delete("/reviews/:id", async (req, res) => {
  const reviewId = req.params.id;

  if (!ObjectId.isValid(reviewId)) {
    return res.status(400).send({ message: "Invalid review ID" });
  }

  const result = await reviewsCollection.deleteOne({
    _id: new ObjectId(reviewId)
  });

  if (result.deletedCount === 0) {
    return res.status(404).send({ message: "Review not found" });
  }

  res.send({ message: "Review deleted successfully" });
});




// Submit a review for an application
app.post('/applications/:id/review', async (req, res) => {
  try {
    const appId = req.params.id;
    const { rating, comment } = req.body;

    const application = await applicationsCollection.findOne({
      _id: new ObjectId(appId)
    });

    if (!application) {
      return res.status(404).send({ message: 'Application not found' });
    }

    const { scholarshipId, userEmail, universityName, scholarshipName } = application;

    // ❌ duplicate review check
    const existingReview = await reviewsCollection.findOne({
      scholarshipId,
      userEmail
    });

    if (existingReview) {
      return res.status(409).send({
        message: 'You already submitted a review for this scholarship'
      });
    }

    // ✅ GET USER DATA FROM users collection
    const user = await usersCollection.findOne({ email: userEmail });

    const review = {
      scholarshipId,
      scholarshipName,
      universityName,
      userEmail,
      userName: user?.displayName || "Anonymous",
      userImage: user?.photoURL || null,
      ratingPoint: rating,
      reviewComment: comment,
      reviewDate: new Date()
    };

    await reviewsCollection.insertOne(review);

    res.status(201).send({ message: 'Review submitted successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).send({
      message: 'Failed to submit review',
      error: err.message
    });
  }
});

// Update a review
app.put("/reviews/:id", async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { ratingPoint, reviewComment } = req.body;

    if (!ObjectId.isValid(reviewId)) {
      return res.status(400).send({ message: "Invalid review ID" });
    }

    const updatedReview = {
      ratingPoint,
      reviewComment,
      reviewDate: new Date() // update review date
    };

    const result = await reviewsCollection.updateOne(
      { _id: new ObjectId(reviewId) },
      { $set: updatedReview }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Review not found" });
    }

    res.status(200).send({ message: "Review updated successfully" });
  } catch (err) {
    res.status(500).send({ message: "Failed to update review", error: err.message });
  }
});

// Delete a review
app.delete("/reviews/:id", async (req, res) => {
  try {
    const reviewId = req.params.id;

    if (!ObjectId.isValid(reviewId)) {
      return res.status(400).send({ message: "Invalid review ID" });
    }

    const result = await reviewsCollection.deleteOne({ _id: new ObjectId(reviewId) });

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Review not found" });
    }

    res.status(200).send({ message: "Review deleted successfully" });
  } catch (err) {
    res.status(500).send({ message: "Failed to delete review", error: err.message });
  }
});


// Admin Analytics API
app.get(
  "/admin/analytics",
  verifyJWTToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const totalUsers = await usersCollection.countDocuments();
      const totalScholarships = await scholarshipsCollection.countDocuments();

      // Total Fees Collected
      const paidApps = await applicationsCollection
        .find({ paymentStatus: "paid" })
        .toArray();

      const totalFeesCollected = paidApps.reduce(
        (sum, app) =>
          sum +
          Number(app.applicationFees || 0) +
          Number(app.serviceCharge || 0),
        0
      );

      // Applications per scholarship category
      const categoryAggregation = await applicationsCollection
        .aggregate([
          {
            $group: {
              _id: "$scholarshipCategory",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              category: { $ifNull: ["$_id", "Unknown"] },
              applications: "$count",
            },
          },
        ])
        .toArray();

      res.send({
        totalUsers,
        totalScholarships,
        totalFeesCollected,
        applicationsByCategory: categoryAggregation,
      });
    } catch (error) {
      res.status(500).send({
        message: "Failed to load admin analytics",
        error: error.message,
      });
    }
  }
);





app.post('/create-checkout-session', async (req, res) => {
  try {
    const { scholarshipId, userEmail, userName } = req.body;

    if (!scholarshipId || !userEmail) {
      return res.status(400).send({ message: 'Missing scholarshipId or userEmail' });
    }

    const scholarship = await scholarshipsCollection.findOne({
      _id: new ObjectId(scholarshipId)
    });

    if (!scholarship) {
      return res.status(404).send({ message: 'Scholarship not found' });
    }

    // Ensure fees are numbers
    const applicationFees = Number(scholarship.applicationFees || 0);
    const serviceCharge = Number(scholarship.serviceCharge || 0);
    const totalAmount = applicationFees + serviceCharge;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalAmount * 100, // Stripe expects amount in cents
          product_data: {
            name: scholarship.scholarshipName
          }
        },
        quantity: 1
      }],
      mode: 'payment',
      metadata: {
        scholarshipId,
        userEmail
      },
      success_url: `${process.env.SITE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/payment-cancelled`
    });

    // Create unpaid application immediately if not exists
    const existingApplication = await applicationsCollection.findOne({
      scholarshipId,
      userEmail
    });

    if (!existingApplication) {
      const application = {
        scholarshipId,
        userEmail,
        userName,
        scholarshipName: scholarship.scholarshipName,
        universityName: scholarship.universityName,
        scholarshipCategory: scholarship.scholarshipCategory,
        degree: scholarship.degree,
        applicationFees: applicationFees,
        serviceCharge: serviceCharge,
        applicationStatus: 'pending',
        paymentStatus: 'unpaid',  // initially unpaid
        applicationDate: new Date()
      };
      await applicationsCollection.insertOne(application);
    }

    res.send({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    res.status(500).send({ message: 'Failed to create checkout session', error: error.message });
  }
});


app.post('/payment-success', async (req, res) => {
  const { sessionId } = req.body;
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    return res.status(400).send({ message: 'Payment not successful' });
  }

  const { scholarshipId, userEmail } = session.metadata;

  const result = await applicationsCollection.updateOne(
    { scholarshipId, userEmail },
    { $set: { paymentStatus: 'paid' } }
  );

  res.send({
    success: true,
    message: 'Payment confirmed, application updated to paid'
  });
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



