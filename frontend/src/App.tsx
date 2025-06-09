import { Chat } from './components/Chat';
import { Box } from '@mui/material';

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Chat />
    </Box>
  );
}

export default App;
