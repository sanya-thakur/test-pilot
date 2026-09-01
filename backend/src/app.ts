import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import healthRoute from './routes/health.route';

// Routes will be added here
app.use('/api/v1/health', healthRoute);

export default app;
