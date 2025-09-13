import { NextApiRequest, NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Server as NetServer } from 'http';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (res.socket.server.io) {
    console.log('Socket is already running');
  } else {
    console.log('Socket is initializing');
    const io = new SocketIOServer(res.socket.server as NetServer);
    res.socket.server.io = io;

    io.on('connection', (socket) => {
      console.log('🔌 Client connected:', socket.id);
      
      // Handle document ID
      socket.on('join_document', (documentId: string) => {
        socket.join(documentId);
        console.log(`🔌 Client ${socket.id} joined document ${documentId}`);
      });

      // Handle transcript streaming
      socket.on('stream_transcript', (data: { text: string; documentId: string }) => {
        console.log('🔌 Received transcript stream:', data.text.substring(0, 50) + '...');
        
        // Simulate semantic analysis (replace with real logic)
        setTimeout(() => {
          const mockMatches = [
            {
              text: data.text.substring(0, 20),
              pageIndex: 0,
              similarity: 0.85,
              startIndex: 0,
              endIndex: 20,
              context: data.text.substring(0, 100)
            }
          ];
          
          socket.emit('semantic_matches', { matches: mockMatches });
        }, 100);
      });

      // Handle complete transcript analysis
      socket.on('analyze_transcript', (data: { text: string; documentId: string }) => {
        console.log('🔌 Analyzing complete transcript:', data.text.substring(0, 50) + '...');
        
        // Simulate semantic analysis
        setTimeout(() => {
          const mockMatches = [
            {
              text: data.text.substring(0, 30),
              pageIndex: 0,
              similarity: 0.90,
              startIndex: 0,
              endIndex: 30,
              context: data.text.substring(0, 150)
            }
          ];
          
          socket.emit('semantic_matches', { matches: mockMatches });
        }, 200);
      });

      socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
      });
    });
  }
  res.end();
}
