import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Chat } from './components/Chat';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1B365D', // SAU 24 navy blue
      light: '#2B4A7D',
      dark: '#0B264D',
    },
    secondary: {
      main: '#C4A777', // SAU 24 gold
      light: '#D4B787',
      dark: '#B49767',
    },
    background: {
      default: '#F5F5F5',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: '"Open Sans", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
      color: '#FFFFFF',
      fontSize: '2rem',
    },
    subtitle1: {
      fontWeight: 500,
      color: '#FFFFFF',
      fontSize: '1.1rem',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Chat />
    </ThemeProvider>
  );
}

export default App;
