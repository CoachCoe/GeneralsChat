import Navbar from '@/components/Navbar';
import { Brain, Clock } from 'lucide-react';

export default function PromptPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827' }}>
      <Navbar />
      
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '2rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 4rem)',
        textAlign: 'center'
      }}>
        <div style={{
          padding: '2rem',
          borderRadius: '1rem',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          marginBottom: '2rem'
        }}>
          <Brain size={64} color="#10b981" />
        </div>
        
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          color: 'white',
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Prompt Management
        </h1>
        
        <p style={{
          fontSize: '1.125rem',
          color: '#9ca3af',
          marginBottom: '2rem',
          maxWidth: '32rem'
        }}>
          Customize the General's responses, create specialized prompts for different incident types, 
          and fine-tune the AI's behavior for your specific compliance needs.
        </p>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.5rem',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '0.75rem',
          color: '#10b981'
        }}>
          <Clock size={20} />
          <span style={{ fontWeight: '500' }}>Coming Soon</span>
        </div>
        
        <div style={{
          marginTop: '3rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          width: '100%',
          maxWidth: '48rem'
        }}>
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.75rem',
            textAlign: 'left'
          }}>
            <h3 style={{ color: 'white', fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>
              Custom Prompts
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Create and manage custom prompts for different incident types, ensuring consistent and appropriate responses.
            </p>
          </div>
          
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.75rem',
            textAlign: 'left'
          }}>
            <h3 style={{ color: 'white', fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>
              Response Templates
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Pre-built response templates for common scenarios, customizable for your school's specific policies.
            </p>
          </div>
          
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '0.75rem',
            textAlign: 'left'
          }}>
            <h3 style={{ color: 'white', fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>
              A/B Testing
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Test different prompt variations to optimize the General's effectiveness and compliance accuracy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
