import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Editor from './pages/Editor'
import MapList from './pages/MapList'
import Navbar from './components/Navbar'

// Simple Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-500 bg-slate-900 h-screen w-screen">
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <pre className="bg-black p-4 rounded overflow-auto">
            {this.state.error && this.state.error.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default function App() {
  useEffect(() => {
    console.log("App mounted");
  }, []);

  return (
    <ErrorBoundary>
        <BrowserRouter>
          <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden">
            <Navbar />
            
            <div className="flex-1 overflow-hidden relative border border-red-500/0"> {/* border for debug if needed */}
                <Routes>
                    <Route path="/" element={<Editor />} />
                    <Route path="/maps" element={<MapList />} />
                </Routes>
            </div>
          </div>
        </BrowserRouter>
    </ErrorBoundary>
  )
}
