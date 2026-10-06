import "dotenv/config";

import express from "express";
import cors from "cors";
import { ensureIndices } from "./services/esClient"; // exporting only the function
import { patientsRouter } from "./routes/patients";
import { healthProfessionalRouter } from "./routes/healthProfessionals";
import { visitsRouter } from "./routes/visits";
import { dashboardRouter } from "./routes/dashboard";
import { reportsRouter } from "./routes/reports";
import { authRouter } from "./routes/auth";
import { requireAuth } from "./middleware/requireAuth";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* 
Notice: /auth (login) and /health-professionals (registration) are left
without requireAuth — that makes sense, because to log in or register 
you don't have a token yet. /patients, /visits, and /dashboard,
on the other hand, now require a valid token before reaching the
actual routes.
*/
app.use("/auth", authRouter)
app.use("/health-professionals", healthProfessionalRouter)

app.use("/patients", requireAuth, patientsRouter);
app.use("/visits", requireAuth, visitsRouter);
app.use("/dashboard", requireAuth, dashboardRouter)
app.use("/reports", requireAuth, reportsRouter)
app.use("/auth", requireAuth, authRouter)

async function start() {
    await ensureIndices();
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    })
}

start();