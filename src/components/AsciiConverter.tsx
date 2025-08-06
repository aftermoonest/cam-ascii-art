import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Camera, Settings, Download, RotateCcw, Info, X, Play, Square, Shuffle } from 'lucide-react';

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

// Google Fonts monospace selection
const MONOSPACE_FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Roboto Mono',
  'Ubuntu Mono',
  'Inconsolata',
  'Space Mono',
  'IBM Plex Mono',
  'PT Mono',
  'Courier Prime',
  'Anonymous Pro',
  'Overpass Mono',
  'Share Tech Mono',
  'Nova Mono',
  'VT323',
  'Major Mono Display'
];

interface Settings {
  fontSize: number;
  letterSpacing: number;
  contrast: number;
  brightness: number;
  saturation: number;
  invert: boolean;
  grayscale: boolean;
  foregroundColor: string;
  backgroundColor: string;
  asciiSet: string;
  fontFamily: string;
  showStats: boolean;
}

interface RandomSettings {
  enabled: boolean;
  interval: number;
  autoMode: boolean;
  controls: {
    fontSize: boolean;
    letterSpacing: boolean;
    contrast: boolean;
    brightness: boolean;
    saturation: boolean;
    invert: boolean;
    grayscale: boolean;
    foregroundColor: boolean;
    backgroundColor: boolean;
    asciiSet: boolean;
    fontFamily: boolean;
  };
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 8,
  letterSpacing: 0,
  contrast: 100,
  brightness: 100,
  saturation: 100,
  invert: false,
  grayscale: true,
  foregroundColor: '#00ff00',
  backgroundColor: '#000000',
  asciiSet: '@#%*+=-:. ',
  fontFamily: 'JetBrains Mono',
  showStats: false
};

const DEFAULT_RANDOM_SETTINGS: RandomSettings = {
  enabled: false,
  interval: 2000,
  autoMode: false,
  controls: {
    fontSize: true,
    letterSpacing: true,
    contrast: true,
    brightness: true,
    saturation: true,
    invert: true,
    grayscale: true,
    foregroundColor: true,
    backgroundColor: true,
    asciiSet: true,
    fontFamily: true,
  }
};

export const AsciiConverter: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asciiRef = useRef<HTMLPreElement>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [randomSettings, setRandomSettings] = useState<RandomSettings>(DEFAULT_RANDOM_SETTINGS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState({ fps: 0, resolution: '' });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoSizing, setAutoSizing] = useState({ fontSize: true, letterSpacing: true });
  const [pixelStep] = useState(6); // Fixed internal value
  
  const frameRef = useRef<number>();
  const lastFrameTime = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const randomIntervalRef = useRef<number>();

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

  // Auto-sizing logic
  const calculateAutoSize = useCallback(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (video.videoWidth && video.videoHeight) {
      const rows = Math.floor(video.videoHeight / pixelStep);
      const cols = Math.floor(video.videoWidth / pixelStep);
      
      let newFontSize = settings.fontSize;
      let newLetterSpacing = settings.letterSpacing;
      
      if (autoSizing.fontSize) {
        newFontSize = viewportHeight / rows;
      }
      
      if (autoSizing.letterSpacing) {
        const glyphAspect = 0.6; // Typical monospace ratio
        const naturalGlyphWidth = newFontSize * glyphAspect;
        const targetSpacing = (viewportWidth / cols) - naturalGlyphWidth;
        newLetterSpacing = Math.max(-2, Math.min(8, targetSpacing / newFontSize));
      }
      
      if (newFontSize !== settings.fontSize || newLetterSpacing !== settings.letterSpacing) {
        setSettings(prev => ({
          ...prev,
          fontSize: Math.max(4, Math.min(128, newFontSize)),
          letterSpacing: newLetterSpacing
        }));
      }
    }
  }, [settings.fontSize, settings.letterSpacing, autoSizing, pixelStep]);

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
    const width = Math.floor(video.videoWidth / pixelStep);
    const height = Math.floor(video.videoHeight / pixelStep);
    
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
  }, [settings, isPlaying, pixelToAscii, pixelStep]);

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

  // Randomization functions
  const randomizeSettings = useCallback(() => {
    if (!randomSettings.enabled) return;
    
    setSettings(prev => {
      const newSettings = { ...prev };
      
      if (randomSettings.controls.fontSize) {
        newSettings.fontSize = Math.floor(Math.random() * (32 - 4)) + 4;
        setAutoSizing(prev => ({ ...prev, fontSize: false }));
      }
      if (randomSettings.controls.letterSpacing) {
        newSettings.letterSpacing = (Math.random() * 10) - 2;
        setAutoSizing(prev => ({ ...prev, letterSpacing: false }));
      }
      if (randomSettings.controls.contrast) {
        newSettings.contrast = Math.floor(Math.random() * 400);
      }
      if (randomSettings.controls.brightness) {
        newSettings.brightness = Math.floor(Math.random() * 400);
      }
      if (randomSettings.controls.saturation) {
        newSettings.saturation = Math.floor(Math.random() * 400);
      }
      if (randomSettings.controls.invert) {
        newSettings.invert = Math.random() > 0.5;
      }
      if (randomSettings.controls.grayscale) {
        newSettings.grayscale = Math.random() > 0.5;
      }
      if (randomSettings.controls.foregroundColor) {
        newSettings.foregroundColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
      }
      if (randomSettings.controls.backgroundColor) {
        newSettings.backgroundColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
      }
      if (randomSettings.controls.asciiSet) {
        const presets = Object.values(ASCII_PRESETS);
        newSettings.asciiSet = presets[Math.floor(Math.random() * presets.length)];
      }
      if (randomSettings.controls.fontFamily) {
        newSettings.fontFamily = MONOSPACE_FONTS[Math.floor(Math.random() * MONOSPACE_FONTS.length)];
      }
      
      return newSettings;
    });
  }, [randomSettings]);

  const startAutoRandomize = useCallback(() => {
    if (randomIntervalRef.current) {
      clearInterval(randomIntervalRef.current);
    }
    
    setRandomSettings(prev => ({ ...prev, autoMode: true }));
    randomIntervalRef.current = window.setInterval(randomizeSettings, randomSettings.interval);
  }, [randomizeSettings, randomSettings.interval]);

  const stopAutoRandomize = useCallback(() => {
    if (randomIntervalRef.current) {
      clearInterval(randomIntervalRef.current);
      randomIntervalRef.current = undefined;
    }
    setRandomSettings(prev => ({ ...prev, autoMode: false }));
  }, []);

  // Auto-sizing on video load and resize
  useEffect(() => {
    calculateAutoSize();
    window.addEventListener('resize', calculateAutoSize);
    return () => window.removeEventListener('resize', calculateAutoSize);
  }, [calculateAutoSize]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.key === 'Escape') {
        setSidebarOpen(prev => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        saveSnapshot();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        randomizeSettings();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [saveSnapshot, randomizeSettings]);

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
          className="leading-none whitespace-pre overflow-hidden select-none animate-flicker"
          style={{
            fontFamily: settings.fontFamily,
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
        {sidebarOpen ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
      </Button>

      {/* Control Sidebar */}
      {sidebarOpen && (
        <div className="fixed top-0 right-0 h-full w-80 bg-gradient-sidebar border-l border-border backdrop-blur-xl z-40 overflow-y-auto p-6 space-y-6">
          {/* Font Controls */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">Font</h3>
            <div>
              <Label htmlFor="fontFamily">Font Family</Label>
              <Select
                value={settings.fontFamily}
                onValueChange={(value) => setSettings(prev => ({ ...prev, fontFamily: value }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONOSPACE_FONTS.map(font => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fontSize">Font Size: {settings.fontSize.toFixed(1)}px</Label>
              <Slider
                id="fontSize"
                min={4}
                max={128}
                step={0.1}
                value={[settings.fontSize]}
                onValueChange={([value]) => {
                  setSettings(prev => ({ ...prev, fontSize: value }));
                  setAutoSizing(prev => ({ ...prev, fontSize: false }));
                }}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="letterSpacing">Letter Spacing: {settings.letterSpacing.toFixed(2)}em</Label>
              <Slider
                id="letterSpacing"
                min={-2}
                max={8}
                step={0.01}
                value={[settings.letterSpacing]}
                onValueChange={([value]) => {
                  setSettings(prev => ({ ...prev, letterSpacing: value }));
                  setAutoSizing(prev => ({ ...prev, letterSpacing: false }));
                }}
                className="mt-2"
              />
            </div>
          </div>

          {/* Visual Controls */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">Visual</h3>
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
            <div>
              <Label htmlFor="saturation">Saturation: {settings.saturation}%</Label>
              <Slider
                id="saturation"
                min={0}
                max={400}
                step={10}
                value={[settings.saturation]}
                onValueChange={([value]) => setSettings(prev => ({ ...prev, saturation: value }))}
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

          {/* Color Controls */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">Colors</h3>
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

          {/* ASCII Character Controls */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">ASCII Characters</h3>
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

          {/* Randomization */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-primary">Randomization</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="randomEnabled">Enable Random Mode</Label>
              <Switch
                id="randomEnabled"
                checked={randomSettings.enabled}
                onCheckedChange={(checked) => setRandomSettings(prev => ({ ...prev, enabled: checked }))}
              />
            </div>
            
            {randomSettings.enabled && (
              <>
                <div>
                  <Label htmlFor="randomInterval">Timer (ms)</Label>
                  <Input
                    id="randomInterval"
                    type="number"
                    value={randomSettings.interval}
                    onChange={(e) => setRandomSettings(prev => ({ ...prev, interval: parseInt(e.target.value) || 2000 }))}
                    className="mt-2"
                    min="100"
                    max="60000"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={randomizeSettings}
                    variant="outline"
                    className="w-full"
                  >
                    <Shuffle className="w-4 h-4 mr-2" />
                    Randomize
                  </Button>
                  <Button
                    onClick={randomSettings.autoMode ? stopAutoRandomize : startAutoRandomize}
                    variant={randomSettings.autoMode ? "destructive" : "default"}
                    className="w-full"
                  >
                    {randomSettings.autoMode ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {randomSettings.autoMode ? 'Stop' : 'Auto'}
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label>Random Controls</Label>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(randomSettings.controls).map(([key, enabled]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => setRandomSettings(prev => ({
                            ...prev,
                            controls: { ...prev.controls, [key]: checked }
                          }))}
                        />
                        <Label className="text-xs capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-primary">Actions</h3>
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

          {/* Keyboard Shortcuts */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-primary flex items-center">
              <Info className="w-4 h-4 mr-2" />
              Shortcuts
            </h3>
            <div className="text-sm space-y-1 text-muted-foreground">
              <div><kbd className="bg-muted px-1 rounded">S</kbd> Save Snapshot</div>
              <div><kbd className="bg-muted px-1 rounded">R</kbd> Randomize</div>
              <div><kbd className="bg-muted px-1 rounded">Esc</kbd> Toggle Sidebar</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};