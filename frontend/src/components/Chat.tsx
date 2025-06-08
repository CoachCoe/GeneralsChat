import { useState, useRef, useEffect } from 'react';
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
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Collapse,
} from '@mui/material';;
import MenuIcon from '@mui/icons-material/Menu';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import logo from '../assets/logo.jpeg';
import { AIService } from '../services/aiService';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import InstagramIcon from '@mui/icons-material/Instagram';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

const aiService = new AIService();

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
  const [isResourcesOpen, setIsResourcesOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await aiService.getResponse(userMessage);
      setMessages(prev => [...prev, { sender: 'bot', text: response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        sender: 'bot', 
        text: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHowIWork = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleResourcesClick = () => {
    setIsResourcesOpen(!isResourcesOpen);
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
        <Box
          component="img"
          src={logo}
          alt="Logo"
          sx={{
            height: { xs: '40px', sm: '50px' },
            width: 'auto',
            cursor: 'pointer'
          }}
        />

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

      {/* Main content with sidebar */}
      <Box sx={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <Box sx={{ 
          width: 240, 
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          display: { xs: 'none', sm: 'block' }
        }}>
          <List>
            <ListItem 
              onClick={handleResourcesClick}
              sx={{ cursor: 'pointer' }}
            >
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText primary="Resources" />
              {isResourcesOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItem>
            <Collapse in={isResourcesOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                <ListItem 
                  sx={{ pl: 4, cursor: 'pointer' }}
                >
                  <ListItemText primary="Coming soon..." />
                </ListItem>
              </List>
            </Collapse>
          </List>
        </Box>

        {/* Chat content */}
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
              maxHeight: 'calc(100vh - 200px)'
            }}
          >
            {messages.map((message, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                  mb: 2
                }}
              >
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    maxWidth: '70%',
                    bgcolor: message.sender === 'user' ? '#e3f2fd' : '#f5f5f5'
                  }}
                >
                  <Typography variant="body1">{message.text}</Typography>
                </Paper>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Paper>

          {/* Input area */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              disabled={isLoading}
            />
            <Button
              variant="contained"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              Send
            </Button>
          </Box>
        </Container>
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

      {/* Footer */}
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