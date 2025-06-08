import { TreeView, TreeItem } from '@mui/lab';
import { Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export const TreeMenu = () => {
  return (
    <Box
      sx={{
        width: 280,
        height: '100vh',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        p: 2,
      }}
    >
      <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
        Resources
      </Typography>
      <TreeView
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        sx={{
          height: '100%',
          flexGrow: 1,
          maxWidth: 280,
          overflowY: 'auto',
        }}
      >
        {/* Tree items will be added here */}
      </TreeView>
    </Box>
  );
}; 