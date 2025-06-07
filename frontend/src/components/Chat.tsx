import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  useTheme,
  Link,
  Stack,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import InstagramIcon from '@mui/icons-material/Instagram';
import logo from '/SAU_24_logo.png';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'bot',
      text: `Hello! I'm your School Discipline Assistant. I can help you with:
• Reporting and documenting discipline incidents
• Guiding you through required forms and procedures
• Ensuring proper timelines are followed
• Identifying who needs to be notified
• Providing step-by-step guidance

How can I help you today?`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { text: userMessage, sender: 'user' }]);
    setIsLoading(true);

    try {
      // Use environment-aware API URL
      const apiUrl = import.meta.env.PROD 
        ? 'https://generalschat.onrender.com/chat'  // Production URL (Render)
        : 'http://localhost:8000/chat';  // Development URL

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { text: data.response, sender: 'bot' }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        text: 'Sorry, I encountered an error. Please try again.', 
        sender: 'bot' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <Container maxWidth="md" sx={{ height: '100vh', py: 4 }}>
      <Paper 
        elevation={3} 
        sx={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
        }}
      >
        <Box sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderBottom: 1, 
          borderColor: 'divider',
          background: theme.palette.primary.main,
          color: 'white',
          borderRadius: '12px 12px 0 0',
          position: 'relative',
        }}>
          <Box sx={{ 
            textAlign: 'center',
            mb: { xs: 2, sm: 0 },
          }}>
            <Typography 
              variant="h4" 
              component="h1" 
              sx={{ 
                fontWeight: 700,
                letterSpacing: '0.5px',
                mb: 1,
                fontSize: { xs: '1.5rem', sm: '2rem' },
              }}
            >
              Ask the General
            </Typography>
            <Typography 
              variant="subtitle1" 
              sx={{ 
                opacity: 0.9,
                fontWeight: 500,
                fontSize: { xs: '0.9rem', sm: '1.1rem' },
              }}
            >
              Your School Discipline Assistant
            </Typography>
          </Box>
          <Link 
            href="https://www.sau24.org/" 
            target="_blank" 
            rel="noopener noreferrer"
            sx={{ 
              position: 'absolute',
              top: { xs: 8, sm: 16 },
              right: { xs: 8, sm: 16 },
              display: 'block',
            }}
          >
            <img 
              src={logo} 
              alt="SAU 24 Logo" 
              style={{ 
                height: '40px',
                width: 'auto',
                [theme.breakpoints.up('sm')]: {
                  height: '60px',
                }
              }} 
            />
          </Link>
        </Box>

        <List sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: { xs: 1, sm: 2 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}>
          {messages.map((message, index) => (
            <ListItem
              key={index}
              sx={{
                justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                px: { xs: 1, sm: 2 },
              }}
            >
              <Paper
                elevation={1}
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  maxWidth: { xs: '90%', sm: '80%' },
                  backgroundColor: message.sender === 'user' 
                    ? theme.palette.primary.main 
                    : theme.palette.background.paper,
                  color: message.sender === 'user' ? 'white' : 'text.primary',
                  borderRadius: 2,
                }}
              >
                <ListItemText 
                  primary={message.text} 
                  sx={{ 
                    '& .MuiListItemText-primary': {
                      whiteSpace: 'pre-wrap',
                      fontSize: { xs: '0.9rem', sm: '1rem' },
                    }
                  }}
                />
              </Paper>
            </ListItem>
          ))}
          {isLoading && (
            <ListItem sx={{ justifyContent: 'flex-start', px: 2 }}>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  backgroundColor: theme.palette.background.paper,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CircularProgress size={20} />
                <Typography>Thinking...</Typography>
              </Paper>
            </ListItem>
          )}
          <div ref={messagesEndRef} />
        </List>

        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              sx={{
                minWidth: '48px',
                height: '48px',
                borderRadius: 2,
              }}
            >
              <SendIcon />
            </Button>
          </Box>
        </Box>

        <Box sx={{ 
          p: { xs: 1.5, sm: 2 }, 
          borderTop: 1, 
          borderColor: 'divider',
          backgroundColor: theme.palette.primary.main,
          color: 'white',
          borderRadius: '0 0 12px 12px',
        }}>
          <Stack 
            direction="row" 
            spacing={2} 
            justifyContent="center" 
            alignItems="center"
            sx={{ mb: 1 }}
          >
            <Link 
              href="https://www.facebook.com/SAU24" 
              target="_blank" 
              rel="noopener noreferrer"
              color="inherit"
              sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
            >
              <FacebookIcon />
            </Link>
            <Link 
              href="https://twitter.com/SAU24" 
              target="_blank" 
              rel="noopener noreferrer"
              color="inherit"
              sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
            >
              <TwitterIcon />
            </Link>
            <Link 
              href="https://www.instagram.com/sau24" 
              target="_blank" 
              rel="noopener noreferrer"
              color="inherit"
              sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
            >
              <InstagramIcon />
            </Link>
          </Stack>
          <Typography 
            variant="body2" 
            align="center" 
            sx={{ 
              opacity: 0.8,
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
            }}
          >
            © {new Date().getFullYear()} SAU 24. All Rights Reserved.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
} 