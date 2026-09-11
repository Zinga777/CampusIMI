import { Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing.js";
import Register from "./pages/Register.js";
import VerifyOtp from "./pages/VerifyOtp.js";
import Login from "./pages/Login.js";
import Onboarding from "./pages/Onboarding.js";
import Feed from "./pages/Feed.js";
import Confessions from "./pages/Confessions.js";
import Matches from "./pages/Matches.js";
import Discover from "./pages/Discover.js";
import Chat from "./pages/Chat.js";
import Events from "./pages/Events.js";
import RequestPost from "./pages/RequestPost.js";
import Admin from "./pages/Admin.js";
import ProtectedRoute from "./components/ProtectedRoute.js";
import AdminGuard from "./components/AdminGuard.js";

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
        path="/discover"
        element={
          <ProtectedRoute requireProfile>
            <Discover />
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
      <Route
        path="/request-post"
        element={
          <ProtectedRoute requireProfile>
            <RequestPost />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireProfile>
            <AdminGuard>
              <Admin />
            </AdminGuard>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
