import { Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing.js";
import Register from "./pages/Register.js";
import VerifyOtp from "./pages/VerifyOtp.js";
import Login from "./pages/Login.js";
import Onboarding from "./pages/Onboarding.js";
import Feed from "./pages/Feed.js";
import Confessions from "./pages/Confessions.js";
import Matches from "./pages/Matches.js";
import Chat from "./pages/Chat.js";
import Events from "./pages/Events.js";
import ProtectedRoute from "./components/ProtectedRoute.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<VerifyOtp />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireNoProfile>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/feed"
        element={
          <ProtectedRoute requireProfile>
            <Feed />
          </ProtectedRoute>
        }
      />
      <Route
        path="/confessions"
        element={
          <ProtectedRoute requireProfile>
            <Confessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/matches"
        element={
          <ProtectedRoute requireProfile>
            <Matches />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:conversationId"
        element={
          <ProtectedRoute requireProfile>
            <Chat />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute requireProfile>
            <Events />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
