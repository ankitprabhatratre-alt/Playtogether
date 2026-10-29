import { Link, Route, Routes } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { CreateRoom } from './pages/CreateRoom';
import { JoinByCode, JoinRoom } from './pages/JoinRoom';
import { Library } from './pages/Library';
import { RoomPage } from './pages/RoomPage';
import { EmptyState } from './components/ui';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/create" element={<CreateRoom />} />
      <Route path="/join" element={<JoinByCode />} />
      <Route path="/join/:roomId" element={<JoinRoom />} />
      <Route path="/games" element={<Library />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route
        path="*"
        element={
          <main className="container narrow">
            <EmptyState icon="🧭" title="Page not found">
              <Link className="btn btn-primary" to="/">
                Go home
              </Link>
            </EmptyState>
          </main>
        }
      />
    </Routes>
  );
}
