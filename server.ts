import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import session from "express-session";

declare module "express-session" {
  interface SessionData {
    admin: boolean;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "valora-admin-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: "lax"
  }
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// MongoDB Connection
console.log("Connecting to MongoDB:", process.env.MONGO_URI ? "ENV FOUND" : "ENV MISSING");

if (!process.env.MONGO_URI) {
  console.error("FATAL ERROR: MONGO_URI is not defined in environment variables.");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Report Schema & Model
const reportSchema = new mongoose.Schema({
  reporterEmail: { type: String, required: true },
  reason: { type: String, required: true },
  message: { type: String, default: "" },
  reportedUserSocketId: { type: String, required: true },
  reportedIP: { type: String, default: "unknown" },
  reportedAt: { type: Date, default: Date.now },
  status: { type: String, default: "pending" }
});

const Report = mongoose.model("Report", reportSchema);

// Ban Schema & Model
const banSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  reason: { type: String, default: "Admin Ban" },
  bannedAt: { type: Date, default: Date.now }
});

const Ban = mongoose.model("Ban", banSchema);

// Admin Middleware
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.admin) {
    if (req.xhr || req.path.startsWith('/admin/api')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect('/admin/login.html');
  }
  next();
}

// API Routes
app.post("/api/report", async (req, res) => {
  try {
    const { reporterEmail, reason, message, reportedUserSocketId } = req.body;
    
    if (!reporterEmail || !/^\S+@\S+\.\S+$/.test(reporterEmail)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!reason) {
      return res.status(400).json({ error: "Reason is required" });
    }

    const reportedIP = userIPs.get(reportedUserSocketId) || "unknown";

    const newReport = new Report({
      reporterEmail,
      reason,
      message: message || "",
      reportedUserSocketId: reportedUserSocketId || "unknown",
      reportedIP,
      reportedAt: new Date(),
      status: "pending"
    });

    await newReport.save();
    console.log(`Report saved to MongoDB: ${reporterEmail} reported ${reportedUserSocketId} for ${reason}`);
    
    res.status(200).json({ success: true, message: "Report submitted successfully" });
  } catch (error) {
    console.error("Error saving report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Auth Routes
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "valora2026";

  if (username === adminUser && password === adminPass) {
    req.session.admin = true;
    console.log(`[ADMIN] Login successful for user: ${username}`);
    res.redirect("/admin/dashboard");
  } else {
    console.log(`[ADMIN] Login failed for user: ${username}`);
    res.redirect("/admin/login.html?error=1");
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login.html');
  });
});

// Admin Dashboard API
app.get("/admin/api/stats", requireAdmin, async (req, res) => {
  try {
    const totalReports = await Report.countDocuments();
    const liveUsers = io.engine.clientsCount;
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const reportsToday = await Report.countDocuments({ reportedAt: { $gte: startOfDay } });

    const bannedToday = await Ban.countDocuments({ bannedAt: { $gte: startOfDay } });
    const totalBanned = await Ban.countDocuments();

    res.json({ totalReports, liveUsers, reportsToday, bannedToday, totalBanned });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/admin/api/reports", requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find().sort({ reportedAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

app.patch("/admin/api/reports/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const updatedReport = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(updatedReport);
  } catch (error) {
    res.status(500).json({ error: "Failed to update report" });
  }
});

app.delete("/admin/api/reports/:id", requireAdmin, async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete report" });
  }
});

app.get("/admin/api/banned-ips", requireAdmin, async (req, res) => {
  try {
    const bans = await Ban.find().sort({ bannedAt: -1 });
    res.json(bans);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch banned IPs" });
  }
});

app.delete("/admin/api/banned-ips/:id", requireAdmin, async (req, res) => {
  try {
    await Ban.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to unban IP" });
  }
});

app.get("/admin/api/analytics", requireAdmin, async (req, res) => {
  try {
    // Basic analytics: reports by reason
    const reportsByReason = await Report.aggregate([
      { $group: { _id: "$reason", count: { $sum: 1 } } }
    ]);
    
    // Reports over last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const reportsByDay = await Report.aggregate([
      { $match: { reportedAt: { $gte: sevenDaysAgo } } },
      { $group: { 
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$reportedAt" } },
          count: { $sum: 1 } 
      } },
      { $sort: { "_id": 1 } }
    ]);

    res.json({ reportsByReason, reportsByDay });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Admin Page Routes
app.get("/admin/dashboard", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/index.html"));
});

app.get("/admin", (req, res) => {
  res.redirect("/admin/dashboard");
});

app.get("/admin/reports-page", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/reports.html"));
});

app.get("/admin/banned-page", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/banned.html"));
});

app.get("/admin/analytics-page", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/analytics.html"));
});

// Protect all other /admin routes (static files)
app.use("/admin", (req, res, next) => {
  // Allow login page and assets
  if (req.path === "/login.html" || req.path === "/admin.css" || req.path === "/admin.js" || req.path === "/login") {
    return next();
  }
  requireAdmin(req, res, next);
});

app.post("/admin/ban", requireAdmin, async (req, res) => {
  try {
    const { ip, reason } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "IP address is required" });
    }
    
    // Save to DB
    const existingBan = await Ban.findOne({ ip });
    if (!existingBan) {
      await new Ban({ ip, reason: reason || "Admin Ban" }).save();
    }

    console.log(`IP ${ip} has been banned by admin.`);
    
    // Disconnect any active sockets with this IP
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      const sIp = s.handshake.headers['x-forwarded-for'] || s.handshake.address;
      const currentIp = Array.isArray(sIp) ? sIp[0] : sIp;
      if (currentIp === ip) {
        s.disconnect(true);
      }
    }
    
    res.json({ message: `IP ${ip} has been banned.` });
  } catch (error) {
    res.status(500).json({ error: "Failed to ban user" });
  }
});

// Clean URL Canonical Redirection Middleware for public pages
app.use((req, res, next) => {
  const urlPath = req.path;
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  if (urlPath === '/index.html') {
    return res.redirect(301, '/' + queryString);
  }
  if (urlPath === '/chat.html') {
    return res.redirect(301, '/chat' + queryString);
  }
  if (urlPath === '/privacy.html') {
    return res.redirect(301, '/privacy' + queryString);
  }
  if (urlPath === '/terms.html') {
    return res.redirect(301, '/terms' + queryString);
  }
  next();
});

// Clean Public Page Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(__dirname, "public/chat.html"));
});

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(__dirname, "public/privacy.html"));
});

app.get("/terms", (req, res) => {
  res.sendFile(path.join(__dirname, "public/terms.html"));
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Matchmaking state
let waitingUser: string | null = null;
const pairs = new Map<string, string>();
const userNames = new Map<string, string>();
const userIPs = new Map<string, string>();

io.on("connection", async (socket) => {
  // Capture IP
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  
  // Check if IP is banned in DB
  const isBanned = await Ban.findOne({ ip });
  if (isBanned) {
    console.log(`Banned user attempted to connect: ${ip}`);
    socket.emit("banned", { reason: isBanned.reason });
    socket.disconnect(true);
    return;
  }
  
  console.log("User connected:", socket.id);
  userIPs.set(socket.id, ip);

  socket.on("find-partner", (data) => {
    if (data && data.name) {
      userNames.set(socket.id, data.name);
    }

    // If already in a pair, disconnect first
    if (pairs.has(socket.id)) {
      const partnerId = pairs.get(socket.id);
      if (partnerId) {
        io.to(partnerId).emit("partner-disconnected");
        pairs.delete(partnerId);
      }
      pairs.delete(socket.id);
    }

    // If this user was the one waiting, clear it
    if (waitingUser === socket.id) {
      waitingUser = null;
    }

    if (waitingUser && waitingUser !== socket.id) {
      const partnerId = waitingUser;
      waitingUser = null;

      pairs.set(socket.id, partnerId);
      pairs.set(partnerId, socket.id);

      // Tell both users to start the connection
      // We designate one as the initiator
      io.to(socket.id).emit("match-found", { 
        partnerId, 
        initiator: true,
        partnerName: userNames.get(partnerId) || 'Stranger'
      });
      io.to(partnerId).emit("match-found", { 
        partnerId: socket.id, 
        initiator: false,
        partnerName: userNames.get(socket.id) || 'Stranger'
      });
      
      console.log(`Matched ${socket.id} with ${partnerId}`);
    } else {
      waitingUser = socket.id;
      socket.emit("waiting");
      console.log(`User ${socket.id} is waiting`);
    }
  });

  socket.on("signal", (data) => {
    const partnerId = pairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("signal", {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  socket.on("chat-message", (data) => {
    const partnerId = pairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("chat-message", {
        message: data.message,
        senderId: socket.id
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    userNames.delete(socket.id);
    userIPs.delete(socket.id);
    if (waitingUser === socket.id) {
      waitingUser = null;
    }
    const partnerId = pairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit("partner-disconnected");
      pairs.delete(partnerId);
      pairs.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
