import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TransferPage() {
  const navigate = useNavigate();
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
}
