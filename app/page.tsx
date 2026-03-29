'use client';

import { useRouter } from 'next/navigation';
import { 
  Container, 
  Center, 
  Text, 
  Stack, 
  Title, 
  Button, 
  Group,
  Box,
} from '@mantine/core';
import { IconArrowRight, IconMessage } from '@tabler/icons-react';

export default function Home() {
  const router = useRouter();

  // This page only shows for unauthenticated users
  // Authenticated users are redirected server-side via middleware
  return (
    <Box style={{ 
      height: 'calc(100vh - 60px)', 
      position: 'relative', 
      overflow: 'hidden',
      backgroundColor: '#ffffff'
    }}>
      <Container 
        size="md" 
        style={{ 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center',
          position: 'relative',
          zIndex: 10
        }}
      >
        <Center style={{ width: '100%' }}>
          <Stack align="center" gap="xl" ta="center">
            <Stack gap="md" align="center">
              <IconMessage size={64} stroke={1.5} color="#2563EB" />
              <Title order={1} size="3rem" fw={800} c="#000000">
                Chat with Any Book
              </Title>
              <Text size="xl" c="#374151" maw={600}>
                Have a conversation with your favorite books. Ask questions, explore ideas,
                and get instant answers powered by AI.
              </Text>
            </Stack>
            
            <Group gap="lg" justify="center">
              <Button
                size="lg"
                variant="filled"
                rightSection={<IconArrowRight size={20} />}
                onClick={() => router.push('/auth/signup')}
                style={{
                  fontWeight: 600,
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                }}
              >
                Get Started
              </Button>
              <Button
                size="lg"
                variant="outline"
                c="#000000"
                style={{ 
                  borderColor: '#374151',
                  color: '#000000',
                  fontWeight: 600
                }}
                onClick={() => router.push('/auth/signin')}
              >
                Sign In
              </Button>
            </Group>
          </Stack>
        </Center>
      </Container>
    </Box>
  );
}
