const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const dotenv=require("dotenv");
dotenv.config();
const salt = bcrypt.genSaltSync(10);
const secret =process.env.SECRET ;
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const PORT = process.env.PORT || 4000;
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'posts',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const uploadMiddleware = multer({ storage });

app.use(cors({credentials:true,origin:process.env.CLIENT_URL}));
app.use(express.json());
app.use(cookieParser());

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to the database successfully.');
  } catch (error) {
    console.error('Error connecting to the database:', error.message);
    process.exit(1); // Exit the process with failure code
  }
}

connectToDatabase();

app.post('/register', async (req,res) => {
  const {username,password} = req.body;
  try{
    const userDoc = await User.create({
      username,
      password:bcrypt.hashSync(password,salt),
    });
    res.json(userDoc);
  } catch(e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post('/login', async (req,res) => {
  const {username,password} = req.body;
  const userDoc = await User.findOne({username});
  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign({username,id:userDoc._id}, secret, {}, (err,token) => {
      if (err) throw err;
      res.cookie('token', token).json({
        id:userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json('wrong credentials');
  }
});

app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ message: 'Token is missing' });
  }
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    res.json(info);
  });
});

app.post('/logout', (req,res) => {
  res.cookie('token', '').json('ok');
});

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
const imageUrl = req.file.path; // Cloudinary URL

  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ message: 'Token is missing' });
  }

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    const { title, summary, content } = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: imageUrl,
      author: info.id,
    });
    res.json(postDoc);
  });
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
let newPath = null;

if (req.file) {
  newPath = req.file.path; // ✅ save Cloudinary URL
}

  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({ message: 'Token is missing' });
  }

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json('You are not the author');
    }
    await postDoc.update({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  });
});

app.get('/post', async (req,res) => {
  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({createdAt: -1})
      .limit(20)
  );
});

app.get('/post/:id', async (req, res) => {
  const {id} = req.params;
  const postDoc = await Post.findById(id).populate('author', ['username']);
  res.json(postDoc);
})

app.listen(PORT, () => console.log(`Server is now running on port ${PORT}`));

const startServer = async () => {
  try {
    if (process.env.NODE_ENV !== "production") {
      app.listen(PORT, () => {
        console.log("Server started on port:", PORT);
      });
    }
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();

export default app;