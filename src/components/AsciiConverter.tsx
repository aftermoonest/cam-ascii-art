import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Camera, Settings, Download, RotateCcw, Info } from 'lucide-react';

// ASCII character presets
const ASCII_PRESETS = {
  'Standard': '@#%*+=-:. ',
  'Minimal': '@ .=+#',
  'Minimal 2': ' .:-=+_X',
  '10 Grays': ' .:*I$VFNM',
  'Symbolic': ' .\':,"-_+=^"',
  'Terminal': ' ._/',
  'Shaded Box': ' ░▒▓█',
  'Shaded Box 2': ' .,:;i1tfLCG08@▒▓█',
  'Distortion': ' ▏▎▍▌▋▊▉█',
  'Binary': '01|¦=+■',
  'Retro': '█▓▒░.-\' "',
  'Block Tech': '□▪▫■▲▼◆◼◻'
};

interface Settings {
  fontSize: number;
  letterSpacing: number;
  pixelStep: number;
  contrast: number;
  brightness: number;
  saturation: number;
  invert: boolean;
  grayscale: boolean;
  foregroundColor: string;
  backgroundColor: string;
  asciiSet: string;
  showStats: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 8,
  letterSpacing: 0,
  pixelStep: 6,
  contrast: 100,
  brightness: 100,
  saturation: 100,
  invert: false,
  grayscale: true,
  foregroundColor: '#00ff00',
  backgroundColor: '#000000',
  asciiSet: '@#%*+=-:. ',
  showStats: false
};

export const AsciiConverter: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState({ fps: 0, resolution: '' });
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const frameRef = useRef<number>();
  const lastFrameTime = useRef<number>(0);
  const frameCount = useRef<number>(0);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ascii-settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('ascii-settings', JSON.stringify(settings));
  }, [settings]);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setIsPlaying(true);
          setCameraError(null);
        }
      } catch (error) {
        console.error('Camera error:', error);
        setCameraError('Camera access denied or unavailable');
      }
    };

    initCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Convert pixel to ASCII character
  const pixelToAscii = useCallback((luminance: number, chars: string): string => {
    const normalized = settings.invert ? 1 - luminance : luminance;
    const index = Math.floor(normalized * (chars.length - 1));
    return chars[Math.max(0, Math.min(index, chars.length - 1))];
  }, [settings.invert]);

  // Process video frame to ASCII
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !asciiRef.current || !isPlaying) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.readyState !== 4) return;

    // Set canvas size based on pixel step
    const width = Math.floor(video.videoWidth / settings.pixelStep);
    const height = Math.floor(video.videoHeight / settings.pixelStep);
    
    canvas.width = width;
    canvas.height = height;

    // Apply CSS filters for performance
    ctx.filter = `
      contrast(${settings.contrast}%) 
      brightness(${settings.brightness}%) 
      saturate(${settings.saturation}%)
      ${settings.grayscale ? 'grayscale(100%)' : ''}
    `;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, width, height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    let ascii = '';
    
    // Process each pixel
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Convert to ASCII
        ascii += pixelToAscii(luminance, settings.asciiSet);
      }
      ascii += '\n';
    }

    // Update ASCII display
    if (asciiRef.current) {
      asciiRef.current.textContent = ascii;
    }

    // Update stats
    const now = performance.now();
    if (now - lastFrameTime.current >= 1000) {
      setStats({
        fps: Math.round(frameCount.current * 1000 / (now - lastFrameTime.current)),
        resolution: `${width}x${height}`
      });
      frameCount.current = 0;
      lastFrameTime.current = now;
    }
    frameCount.current++;

    // Schedule next frame
    frameRef.current = requestAnimationFrame(processFrame);
  }, [settings, isPlaying, pixelToAscii]);

  // Start/stop processing
  useEffect(() => {
    if (isPlaying) {
      lastFrameTime.current = performance.now();
      frameCount.current = 0;
      processFrame();
    } else if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isPlaying, processFrame]);

  // Save snapshot
  const saveSnapshot = useCallback(() => {
    if (!asciiRef.current) return;
    
    // Create canvas for snapshot
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ascii = asciiRef.current.textContent || '';
    const lines = ascii.split('\n');
    const maxWidth = Math.max(...lines.map(line => line.length));
    
    // Set canvas size
    canvas.width = maxWidth * settings.fontSize * 0.6;
    canvas.height = lines.length * settings.fontSize * 1.2;
    
    // Style canvas
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = settings.foregroundColor;
    ctx.font = `${settings.fontSize}px monospace`;
    ctx.textBaseline = 'top';
    
    // Draw ASCII text
    lines.forEach((line, index) => {
      ctx.fillText(line, 0, index * settings.fontSize * 1.2);
    });
    
    // Download
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascii-art-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }, [settings]);

  // Reset settings
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(prev => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        saveSnapshot();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        // Randomize could be implemented here
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [saveSnapshot]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden relative">
      {/* Hidden video and canvas elements */}
      <video
        ref={videoRef}
        className="hidden"
        autoPlay
        muted
        playsInline
      />
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* ASCII Art Display */}
      <div className="fixed inset-0 flex items-center justify-center">
        <pre
          ref={asciiRef}
          className="font-terminal leading-none whitespace-pre overflow-hidden select-none animate-flicker"
          style={{
            fontSize: `${settings.fontSize}px`,
            letterSpacing: `${settings.letterSpacing}em`,
            color: settings.foregroundColor,
            backgroundColor: settings.backgroundColor,
            textShadow: '0 0 10px currentColor'
          }}
        />
      </div>

      {/* Stats Overlay */}
      {settings.showStats && (
        <div className="fixed top-4 left-4 bg-card/80 backdrop-blur border border-border rounded p-2 text-sm font-mono">
          <div>FPS: {stats.fps}</div>
          <div>Resolution: {stats.resolution}</div>
        </div>
      )}

      {/* Camera Error */}
      {cameraError && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-destructive/20 border border-destructive rounded-lg p-6 text-center">
          <Camera className="w-12 h-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">Camera Error</h3>
          <p className="text-muted-foreground">{cameraError}</p>
        </div>
      )}

      {/* Sidebar Toggle */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-50 bg-card/80 backdrop-blur border-primary/30 hover:border-primary hover:shadow-terminal"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Settings className="w-4 h-4" />
      </Button>

      {/* Control Sidebar */}
      {sidebarOpen && (
        <div className="fixed top-0 right-0 h-full w-80 bg-gradient-sidebar border-l border-border backdrop-blur-xl z-40 overflow-y-auto p-6 space-y-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary mb-2">ASCII Art</h1>
            <p className="text-sm text-muted-foreground">Real-time webcam converter</p>
          </div>

          {/* Geometry Controls */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4 text-primary">Geometry</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="fontSize">Font Size: {settings.fontSize}px</Label>
                <Slider
                  id="fontSize"
                  min={4}
                  max={32}
                  step={1}
                  value={[settings.fontSize]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, fontSize: value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="letterSpacing">Letter Spacing: {settings.letterSpacing}em</Label>
                <Slider
                  id="letterSpacing"
                  min={-2}
                  max={2}
                  step={0.1}
                  value={[settings.letterSpacing]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, letterSpacing: value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="pixelStep">Pixel Step: {settings.pixelStep}</Label>
                <Slider
                  id="pixelStep"
                  min={1}
                  max={16}
                  step={1}
                  value={[settings.pixelStep]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, pixelStep: value }))}
                  className="mt-2"
                />
              </div>
            </div>
          </Card>

          {/* Visual Controls */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4 text-primary">Visual</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="contrast">Contrast: {settings.contrast}%</Label>
                <Slider
                  id="contrast"
                  min={0}
                  max={400}
                  step={10}
                  value={[settings.contrast]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, contrast: value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="brightness">Brightness: {settings.brightness}%</Label>
                <Slider
                  id="brightness"
                  min={0}
                  max={400}
                  step={10}
                  value={[settings.brightness]}
                  onValueChange={([value]) => setSettings(prev => ({ ...prev, brightness: value }))}
                  className="mt-2"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="invert">Invert Luminance</Label>
                <Switch
                  id="invert"
                  checked={settings.invert}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, invert: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="grayscale">Force Grayscale</Label>
                <Switch
                  id="grayscale"
                  checked={settings.grayscale}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, grayscale: checked }))}
                />
              </div>
            </div>
          </Card>

          {/* Color Controls */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4 text-primary">Colors</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="foregroundColor">ASCII Color</Label>
                <Input
                  id="foregroundColor"
                  type="color"
                  value={settings.foregroundColor}
                  onChange={(e) => setSettings(prev => ({ ...prev, foregroundColor: e.target.value }))}
                  className="mt-2 h-12"
                />
              </div>
              <div>
                <Label htmlFor="backgroundColor">Background Color</Label>
                <Input
                  id="backgroundColor"
                  type="color"
                  value={settings.backgroundColor}
                  onChange={(e) => setSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                  className="mt-2 h-12"
                />
              </div>
            </div>
          </Card>

          {/* ASCII Character Controls */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4 text-primary">ASCII Characters</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="asciiPreset">Preset</Label>
                <Select
                  value={Object.entries(ASCII_PRESETS).find(([_, chars]) => chars === settings.asciiSet)?.[0] || 'Custom'}
                  onValueChange={(preset) => {
                    if (preset !== 'Custom' && ASCII_PRESETS[preset as keyof typeof ASCII_PRESETS]) {
                      setSettings(prev => ({ ...prev, asciiSet: ASCII_PRESETS[preset as keyof typeof ASCII_PRESETS] }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(ASCII_PRESETS).map(preset => (
                      <SelectItem key={preset} value={preset}>{preset}</SelectItem>
                    ))}
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="asciiSet">Characters</Label>
                <Input
                  id="asciiSet"
                  value={settings.asciiSet}
                  onChange={(e) => setSettings(prev => ({ ...prev, asciiSet: e.target.value }))}
                  className="mt-2 font-mono"
                  placeholder="Enter ASCII characters..."
                />
              </div>
            </div>
          </Card>

          {/* Actions */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4 text-primary">Actions</h3>
            <div className="space-y-3">
              <Button
                onClick={saveSnapshot}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Download className="w-4 h-4 mr-2" />
                Save Snapshot (S)
              </Button>
              <Button
                onClick={resetSettings}
                variant="outline"
                className="w-full"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Settings
              </Button>
              <div className="flex items-center justify-between">
                <Label htmlFor="showStats">Show Stats</Label>
                <Switch
                  id="showStats"
                  checked={settings.showStats}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, showStats: checked }))}
                />
              </div>
            </div>
          </Card>

          {/* Keyboard Shortcuts */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4 text-primary flex items-center">
              <Info className="w-4 h-4 mr-2" />
              Shortcuts
            </h3>
            <div className="text-sm space-y-1 text-muted-foreground">
              <div><kbd className="bg-muted px-1 rounded">S</kbd> Save Snapshot</div>
              <div><kbd className="bg-muted px-1 rounded">Esc</kbd> Toggle Sidebar</div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};