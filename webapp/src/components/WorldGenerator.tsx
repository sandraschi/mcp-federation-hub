import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Loader2, Globe, Image, Video, Download, Eye, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface WorldResult {
  success: boolean;
  world_id?: string;
  viewer_url?: string;
  download_formats?: string[];
  error?: string;
  status?: string;
  prompt?: string;
  image_url?: string;
  video_url?: string;
}

interface WorldStatus {
  success: boolean;
  world_id: string;
  status: string;
  viewer_url?: string;
  download_formats?: string[];
  error?: string;
}

const WorldGenerator: React.FC = () => {
  const [activeTab, setActiveTab] = useState('text');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [worldResult, setWorldResult] = useState<WorldResult | null>(null);
  const [worldStatus, setWorldStatus] = useState<WorldStatus | null>(null);
  const [downloadFormat, setDownloadFormat] = useState('gltf');

  const handleGenerateWorld = async () => {
    setIsGenerating(true);
    setWorldResult(null);
    setWorldStatus(null);

    try {
      let requestBody: any = {
        wait_for_completion: true
      };

      if (activeTab === 'text' && prompt) {
        requestBody.prompt = prompt;
      } else if (activeTab === 'image' && imageUrl) {
        requestBody.image_url = imageUrl;
      } else if (activeTab === 'video' && videoUrl) {
        requestBody.video_url = videoUrl;
      } else {
        toast.error('Please provide the required input for the selected generation type');
        setIsGenerating(false);
        return;
      }

      const response = await fetch('/api/v1/worldlabs/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result: WorldResult = await response.json();

      if (result.success) {
        setWorldResult(result);
        toast.success('World generation completed successfully!');
      } else {
        toast.error(`Generation failed: ${result.error || 'Unknown error'}`);
        setWorldResult(result);
      }
    } catch (error) {
      console.error('Error generating world:', error);
      toast.error('Failed to generate world. Please try again.');
      setWorldResult({
        success: false,
        error: 'Network error or server unavailable'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCheckStatus = async (worldId: string) => {
    try {
      const response = await fetch(`/api/v1/worldlabs/status/${worldId}`);
      const status: WorldStatus = await response.json();

      if (status.success) {
        setWorldStatus(status);
        if (status.status === 'completed') {
          toast.success('World is ready!');
        } else if (status.status === 'failed') {
          toast.error('World generation failed');
        }
      } else {
        toast.error(`Status check failed: ${status.error}`);
      }
    } catch (error) {
      console.error('Error checking status:', error);
      toast.error('Failed to check world status');
    }
  };

  const handleDownloadWorld = async (worldId: string, format: string) => {
    try {
      const requestBody = {
        world_id: worldId,
        format: format,
        output_path: null // Let the user download via URL
      };

      const response = await fetch('/api/v1/worldlabs/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success && result.download_url) {
        // Open download URL in new tab
        window.open(result.download_url, '_blank');
        toast.success('Download started!');
      } else {
        toast.error(`Download failed: ${result.error || 'No download URL available'}`);
      }
    } catch (error) {
      console.error('Error downloading world:', error);
      toast.error('Failed to download world');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'processing': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      case 'timeout': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Ready';
      case 'processing': return 'Generating...';
      case 'failed': return 'Failed';
      case 'timeout': return 'Timeout';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            WorldLabs World Generator
          </CardTitle>
          <CardDescription>
            Generate explorable 3D worlds using WorldLabs.ai Marble multimodal model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <span>Text</span>
              </TabsTrigger>
              <TabsTrigger value="image" className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                <span>Image</span>
              </TabsTrigger>
              <TabsTrigger value="video" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                <span>Video</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt">World Description</Label>
                <Textarea
                  id="prompt"
                  placeholder="Describe your world in detail... (e.g., 'A peaceful forest glade with sunlight filtering through ancient trees and a crystal-clear stream')"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <p className="text-sm text-gray-500">
                  Provide a publicly accessible image URL
                </p>
              </div>
            </TabsContent>

            <TabsContent value="video" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="videoUrl">Video URL</Label>
                <Input
                  id="videoUrl"
                  type="url"
                  placeholder="https://example.com/video.mp4"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
                <p className="text-sm text-gray-500">
                  Provide a publicly accessible video URL
                </p>
              </div>
            </TabsContent>

            <div className="flex gap-4 pt-4">
              <Button
                onClick={handleGenerateWorld}
                disabled={isGenerating}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating World...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    Generate World
                  </>
                )}
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Generation Result */}
      {worldResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Generation Result
              {worldResult.world_id && (
                <Badge
                  variant={worldResult.success ? "default" : "destructive"}
                  className="ml-auto"
                >
                  {worldResult.success ? "Success" : "Failed"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {worldResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>World ID</Label>
                    <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                      {worldResult.world_id}
                    </p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(worldResult.status || 'unknown')}>
                        {getStatusText(worldResult.status || 'unknown')}
                      </Badge>
                    </div>
                  </div>
                </div>

                {worldResult.viewer_url && (
                  <div className="space-y-2">
                    <Label>World Viewer</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => window.open(worldResult.viewer_url, '_blank')}
                        className="flex-1"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View World
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => worldResult.world_id && handleCheckStatus(worldResult.world_id)}
                      >
                        Refresh Status
                      </Button>
                    </div>
                  </div>
                )}

                {worldResult.download_formats && worldResult.download_formats.length > 0 && (
                  <div className="space-y-2">
                    <Label>Download World</Label>
                    <div className="flex gap-2">
                      <Select value={downloadFormat} onValueChange={setDownloadFormat}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {worldResult.download_formats.map((format) => (
                            <SelectItem key={format} value={format}>
                              {format.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => worldResult.world_id && handleDownloadWorld(worldResult.world_id, downloadFormat)}
                        disabled={!worldResult.world_id}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span>{worldResult.error || 'Generation failed'}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* World Status (when checked separately) */}
      {worldStatus && (
        <Card>
          <CardHeader>
            <CardTitle>World Status Check</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(worldStatus.status)}>
                  {getStatusText(worldStatus.status)}
                </Badge>
                <span className="text-sm text-gray-500">World ID: {worldStatus.world_id}</span>
              </div>

              {worldStatus.viewer_url && (
                <Button
                  variant="outline"
                  onClick={() => window.open(worldStatus.viewer_url, '_blank')}
                  className="w-full"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View World
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WorldGenerator;