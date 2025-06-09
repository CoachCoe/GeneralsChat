import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Paper, 
  Typography, 
  Container,
  AppBar,
  Toolbar,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Drawer,
  ListItemIcon,
  Tooltip,
  Divider,
  Link
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import HistoryIcon from '@mui/icons-material/History';
import { aiService } from '../services/aiService';
import logo from '../assets/logo.jpeg';
import UploadIcon from '@mui/icons-material/Upload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';

const drawerWidth = 80;

interface Message {
  text: string;
  isUser: boolean;
}

interface SummaryItem {
  key: string;
  value: string;
}

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [summaryItems, setSummaryItems] = useState<SummaryItem[]>([]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Add initial greeting
    setMessages([
      { text: "Hello! What can I help you with today?", isUser: false }
    ]);
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);
    setIsLoading(true);

    try {
      // Format context to clearly show the conversation flow
      const contextMessages = messages.map((m, index) => {
        const role = m.isUser ? 'User' : 'Assistant';
        return `${role} (${index + 1}): ${m.text}`;
      }).join('\n');
      
      const response = await aiService.getResponse(userMessage, contextMessages);
      
      // Extract data from response if present
      const dataMatches = response.match(/\[DATA\](.*?)\[\/DATA\]/g);
      let displayResponse = response;
      let newSummaryItems: SummaryItem[] = [];

      if (dataMatches) {
        // Remove all data markers from the displayed response
        displayResponse = response.replace(/\[DATA\].*?\[\/DATA\]/g, '').trim();
        
        // Process each data match
        dataMatches.forEach(match => {
          const content = match.replace(/\[DATA\]|\[\/DATA\]/g, '');
          const [key, value] = content.split(':').map(s => s.trim());
          if (key && value) {
            // Only add to summary if this is new information and not a placeholder
            if (!value.includes('Please provide') && 
                !value.includes('Where did this happen') && 
                !value.includes('What happened') &&
                !value.startsWith('[') && 
                !value.endsWith(']') &&
                !value.includes('Unknown') &&
                !value.includes('None') &&
                !value.includes('No;') &&
                !value.includes('causing') &&
                !value.includes('disturbance') &&
                !value.includes('XX/XX/XXXX') &&
                !value.includes('YY') &&
                !value.includes('Not specified')) {
              // Only add to summary if this is new information
              const isNewInfo = !summaryItems.some(item => 
                item.key === key && item.value === value
              );
              
              if (isNewInfo) {
                newSummaryItems.push({ key, value });
              }
            }
          }
        });
      }

      // Add the cleaned response to messages
      setMessages(prev => [...prev, { text: displayResponse, isUser: false }]);

      // Update summary with new items
      if (newSummaryItems.length > 0) {
        setSummaryItems(prev => {
          const updated = [...prev];
          newSummaryItems.forEach(newItem => {
            const existingIndex = updated.findIndex(item => item.key === newItem.key);
            if (existingIndex >= 0) {
              updated[existingIndex] = newItem;
            } else {
              updated.push(newItem);
            }
          });
          return updated;
        });
      }

      // If no data markers were found but we have a user message, check if it's a response to a question
      if (!dataMatches && userMessage) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && !lastMessage.isUser) {
          const question = lastMessage.text.toLowerCase();
          let key = '';
          
          if (question.includes('when did this happen')) {
            key = 'Date/Time';
          } else if (question.includes('where did this happen')) {
            key = 'Location';
          } else if (question.includes('who was involved')) {
            key = 'Students Involved';
          } else if (question.includes('staff members involved')) {
            key = 'Staff Involved';
          } else if (question.includes('what happened')) {
            key = 'Description';
          } else if (question.includes('witnesses')) {
            key = 'Witnesses';
          } else if (question.includes('immediate action')) {
            key = 'Action Taken';
          } else if (question.includes('injured') || question.includes('damage')) {
            key = 'Injuries/Damage';
          }

          if (key) {
            setSummaryItems(prev => {
              const existingIndex = prev.findIndex(item => item.key === key);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = { key, value: userMessage };
                return updated;
              }
              return [...prev, { key, value: userMessage }];
            });
          }
        }
      }
    } catch (error) {
      console.error('Error in handleSend:', error);
      setMessages(prev => [...prev, { 
        text: "Sorry, I encountered an error. Please try again.", 
        isUser: false 
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

  const handleCopy = () => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && !lastMessage.isUser) {
      navigator.clipboard.writeText(lastMessage.text);
    }
  };

  const handleNewChat = () => {
    setMessages([{ text: "Hello! What can I help you with today?", isUser: false }]);
    setSummaryItems([]);
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      minHeight: '100vh',
      backgroundColor: '#ffffff'
    }}>
      {/* Left Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#1a237e',
            borderRight: '1px solid #e0e0e0'
          },
        }}
      >
        <Box sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
          <img src={logo} alt="Logo" style={{ height: '32px' }} />
        </Box>
        <Divider />
        <Box sx={{ mt: 4 }}>
          <List>
            <Tooltip title="New Chat" placement="right">
              <ListItem 
                component="div"
                onClick={handleNewChat}
                sx={{
                  cursor: 'pointer',
                  justifyContent: 'center',
                  '&:hover': {
                    backgroundColor: 'rgba(0,0,0,0.04)'
                  }
                }}
              >
                <ListItemIcon sx={{ color: '#1a237e', minWidth: 'auto' }}>
                  <AddIcon />
                </ListItemIcon>
              </ListItem>
            </Tooltip>
            <Tooltip title="Recent Chats" placement="right">
              <ListItem 
                component="div"
                sx={{
                  cursor: 'pointer',
                  justifyContent: 'center',
                  '&:hover': {
                    backgroundColor: 'rgba(0,0,0,0.04)'
                  }
                }}
              >
                <ListItemIcon sx={{ color: '#1a237e', minWidth: 'auto' }}>
                  <HistoryIcon />
                </ListItemIcon>
              </ListItem>
            </Tooltip>
          </List>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box sx={{ 
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        ml: `${drawerWidth}px`,
        width: `calc(100% - ${drawerWidth}px)`
      }}>
        <AppBar 
          position="fixed" 
          sx={{ 
            backgroundColor: '#1a237e',
            zIndex: (theme) => theme.zIndex.drawer + 1,
            width: '100%',
            left: 0
          }}
        >
          <Toolbar>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <img src={logo} alt="Logo" style={{ height: '32px', marginRight: '16px' }} />
              <Typography variant="h6" sx={{ color: 'white' }}>
                Ask the General
              </Typography>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              edge="end"
              color="inherit"
              aria-label="menu"
            >
              <MenuIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Toolbar /> {/* Spacer for fixed AppBar */}

        <Box sx={{ 
          flexGrow: 1, 
          mt: 2,
          mb: 2,
          px: 2,
          display: 'flex',
          gap: 2,
          position: 'relative',
          justifyContent: 'center'
        }}>
          <Paper 
            elevation={3} 
            sx={{ 
              flexGrow: 1,
              maxWidth: '800px',
              maxHeight: 'calc(100vh - 200px)',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              borderRadius: 2,
              overflow: 'hidden'
            }}
          >
            <Box
              ref={chatContainerRef}
              sx={{
                flexGrow: 1,
                overflow: 'auto',
                p: 2,
                scrollBehavior: 'smooth',
                maxHeight: 'calc(100vh - 300px)',
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  background: '#f1f1f1',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: '#888',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  background: '#555',
                }
              }}
            >
              {messages.map((message, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    justifyContent: message.isUser ? 'flex-end' : 'flex-start',
                    mb: 2
                  }}
                >
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      maxWidth: '70%',
                      backgroundColor: message.isUser ? '#e3f2fd' : '#ffffff',
                      borderRadius: 2,
                      border: message.isUser ? 'none' : '1px solid #e0e0e0'
                    }}
                  >
                    <Typography>{message.text}</Typography>
                  </Paper>
                </Box>
              ))}
            </Box>

            <Paper 
              elevation={3}
              sx={{
                p: 2,
                backgroundColor: '#ffffff',
                borderTop: '1px solid #e0e0e0'
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    variant="outlined"
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading}
                    multiline
                    maxRows={4}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: '#ffffff',
                        borderRadius: 2
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    sx={{
                      minWidth: '100px',
                      backgroundColor: '#1a237e',
                      '&:hover': {
                        backgroundColor: '#0d47a1'
                      }
                    }}
                  >
                    {isLoading ? 'Sending...' : 'Send'}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<UploadIcon />}
                    sx={{
                      borderColor: '#1a237e',
                      color: '#1a237e',
                      '&:hover': {
                        borderColor: '#0d47a1',
                        backgroundColor: 'rgba(26, 35, 126, 0.04)'
                      }
                    }}
                  >
                    Upload File
                    <input
                      type="file"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // TODO: Handle file upload
                          console.log('File selected:', file.name);
                        }
                      }}
                    />
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={handleCopy}
                    disabled={messages.length === 0 || messages[messages.length - 1].isUser}
                    sx={{
                      borderColor: '#1a237e',
                      color: '#1a237e',
                      '&:hover': {
                        borderColor: '#0d47a1',
                        backgroundColor: 'rgba(26, 35, 126, 0.04)'
                      }
                    }}
                  >
                    Copy
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Paper>

          {/* Summary Panel */}
          <Paper
            elevation={3}
            sx={{
              width: '300px',
              p: 2,
              backgroundColor: '#ffffff',
              borderRadius: 2,
              height: 'fit-content',
              position: 'sticky',
              top: '80px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Typography variant="h6" gutterBottom>
              Incident Summary
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ flexGrow: 1 }}>
              {summaryItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No details collected yet
                </Typography>
              ) : (
                <List dense>
                  {summaryItems.map((item, index) => (
                    <ListItem key={index} sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={item.value}
                        sx={{
                          '& .MuiListItemText-primary': {
                            fontSize: '0.9rem'
                          }
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Tooltip title="Copy Summary">
                <IconButton 
                  size="small"
                  onClick={() => {
                    const summaryText = summaryItems.map(item => item.value).join('\n');
                    navigator.clipboard.writeText(summaryText);
                  }}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save Summary">
                <IconButton size="small">
                  <SaveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Send Summary">
                <IconButton size="small">
                  <SendIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Footer - Moved outside main content box */}
      <Box
        component="footer"
        sx={{
          py: 3,
          px: 2,
          backgroundColor: '#1a237e',
          color: 'white',
          width: '100%',
          position: 'fixed',
          bottom: 0,
          left: 0,
          zIndex: (theme) => theme.zIndex.drawer + 1
        }}
      >
        <Container maxWidth={false}>
          <Typography variant="body2" align="center">
            © {new Date().getFullYear()} School Discipline Chatbot. All rights reserved.
          </Typography>
          <Typography variant="body2" align="center" sx={{ mt: 1 }}>
            <Link href="#" color="inherit" sx={{ mx: 1 }}>
              Privacy Policy
            </Link>
            |
            <Link href="#" color="inherit" sx={{ mx: 1 }}>
              Terms of Service
            </Link>
            |
            <Link href="#" color="inherit" sx={{ mx: 1 }}>
              Contact
            </Link>
          </Typography>
        </Container>
      </Box>

      {/* Add padding to main content to account for fixed footer */}
      <Box sx={{ height: '100px' }} />
    </Box>
  );
};

export { Chat }; 