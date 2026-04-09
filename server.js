require('dotenv').config();

const mongoose = require('mongoose');

const { config, firebaseAdminConfigured } = require('./src/config');
const { createApp } = require('./src/app');

if (!config.mongoUri) {
  console.error('Missing MONGODB_URI. Set it to your MongoDB connection string.');
  process.exit(1);
}

if (firebaseAdminConfigured) {
  console.log('Firebase Admin initialized.');
} else {
  console.warn(
    'Firebase Admin credentials are not configured. Protected routes will return setup errors until configured.'
  );
}

const { server, io, setShuttingDown } = createApp();

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected.');
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
});

mongoose
  .connect(config.mongoUri)
  .then(() => {
    server.listen(config.port, () => {
      console.log(`AcharyaKul server running at http://localhost:${config.port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  setShuttingDown(true);
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error('Shutdown failed:', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error('Shutdown failed:', error);
    process.exit(1);
  });
});
