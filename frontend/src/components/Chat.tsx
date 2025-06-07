import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  useTheme,
  Link,
  Stack,
  IconButton,
  Modal,
} from '@mui/material';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import InstagramIcon from '@mui/icons-material/Instagram';
import MenuIcon from '@mui/icons-material/Menu';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'bot',
      text: `How can I help you today?`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const handleHowIWork = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: '100vh',
      bgcolor: '#f5f5f5'
    }}>
      {/* Header */}
      <Box sx={{ 
        bgcolor: '#1a237e', 
        color: 'white', 
        p: 2,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Logo on the left */}
        <Link href="https://www.sau24.org" target="_blank" rel="noopener noreferrer">
          <Box
            component="img"
            src="/SAU_24_logo.png"
            alt="SAU 24 Logo"
            sx={{
              height: { xs: '40px', sm: '50px' },
              width: 'auto',
              cursor: 'pointer'
            }}
          />
        </Link>

        {/* Title in the center */}
        <Box sx={{ 
          flex: 1, 
          textAlign: 'center',
          mx: 2
        }}>
          <Typography variant="h4" component="h1" sx={{ 
            fontSize: { xs: '1.5rem', sm: '2rem' },
            fontWeight: 'bold'
          }}>
            Ask the General
          </Typography>
          <Typography variant="subtitle1" sx={{ 
            fontSize: { xs: '0.875rem', sm: '1rem' }
          }}>
            School Discipline Assistant
          </Typography>
        </Box>

        {/* Hamburger menu on the right */}
        <IconButton 
          color="inherit" 
          onClick={handleHowIWork}
          sx={{ 
            ml: 'auto',
            display: { xs: 'flex', sm: 'flex' }
          }}
        >
          <MenuIcon />
        </IconButton>
      </Box>

      {/* How I Work Modal */}
      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        aria-labelledby="how-i-work-modal"
      >
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: { xs: '90%', sm: '600px' },
          bgcolor: 'background.paper',
          boxShadow: 24,
          p: 4,
          borderRadius: 2,
          maxHeight: '80vh',
          overflow: 'auto'
        }}>
          <Typography variant="h5" component="h2" gutterBottom>
            How I Work
          </Typography>
          <Typography variant="body1" paragraph>
            I'm your School Discipline Assistant. I can help you with:
          </Typography>
          <Typography component="div" sx={{ pl: 2 }}>
            <ul>
              <li>Reporting and documenting discipline incidents</li>
              <li>Guiding you through required forms and procedures</li>
              <li>Ensuring proper timelines are followed</li>
              <li>Identifying who needs to be notified</li>
              <li>Providing step-by-step guidance</li>
            </ul>
          </Typography>
          <Button 
            variant="contained" 
            onClick={handleCloseModal}
            sx={{ mt: 2 }}
          >
            Close
          </Button>
        </Box>
      </Modal>

      {/* Main content */}
      <Container maxWidth="md" sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        py: 2
      }}>
        {/* Messages container */}
        <Paper 
          elevation={3} 
          sx={{ 
            flex: 1, 
            mb: 2, 
            p: 2, 
            overflow: 'auto',
            bgcolor: 'white',
            borderRadius: 2
          }}
        >
          {messages.length === 0 ? (
            <Box sx={{ 
              textAlign: 'center', 
              color: 'text.secondary',
              py: 4
            }}>
              <Typography variant="h6">
                How can I help you today?
              </Typography>
            </Box>
          ) : (
            messages.map((msg, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  mb: 2
                }}
              >
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    maxWidth: '80%',
                    bgcolor: msg.sender === 'user' ? '#e3f2fd' : '#f5f5f5',
                    borderRadius: 2
                  }}
                >
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </Typography>
                </Paper>
              </Box>
            ))
          )}
          <div ref={messagesEndRef} />
        </Paper>

        {/* Input area */}
        <Box sx={{ 
          display: 'flex', 
          gap: 1,
          bgcolor: 'white',
          p: 2,
          borderRadius: 2,
          boxShadow: 1
        }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            sx={{
              minWidth: '100px',
              borderRadius: 2,
              bgcolor: '#1a237e',
              '&:hover': {
                bgcolor: '#0d47a1'
              }
            }}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </Button>
        </Box>
      </Container>

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
    </Box>
  );
} 