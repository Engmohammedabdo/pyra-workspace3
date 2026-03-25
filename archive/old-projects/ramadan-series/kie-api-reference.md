# Kie.ai API Reference — Quick Guide

## Auth
```
Authorization: Bearer bb95f4d46f57be29c3181d55e246d403
Content-Type: application/json
```

## Credits Check
```
GET https://api.kie.ai/api/v1/chat/credit
```

## Create Task (Image/Video)
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

## Check Task Status
```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
```
States: waiting → queuing → generating → success/fail

## Download URL
```
POST https://api.kie.ai/api/v1/common/download-url
Body: {"url": "https://tempfile..."}
```

## Models

### Nano Banana Pro (Image)
```json
{
  "model": "google/nano-banana",
  "callBackUrl": "https://example.com/cb",
  "input": {
    "prompt": "...",
    "output_format": "png",
    "image_size": "9:16"
  }
}
```

### Kling 3.0 (Video)
```json
{
  "model": "kling-3.0",
  "input": {
    "prompt": "...",
    "image_urls": ["https://...first-frame.png"],
    "sound": true,
    "duration": "5",
    "aspect_ratio": "9:16",
    "mode": "pro",
    "multi_shots": false,
    "kling_elements": [
      {
        "name": "element_character",
        "description": "character name",
        "element_input_urls": ["https://...ref1.png", "https://...ref2.png"]
      }
    ]
  }
}
```

### Suno (Music)
- Endpoint: Suno API via Kie.ai
- Generate music, lyrics, extend, etc.

## ElevenLabs (Direct)
```
API Key: sk_e36c12a0303527db9964630c0243a9d84b93154b8cad6517
Voices:
- Haytham (Egyptian male): IES4nrmZdUBHByLBde0P
- Masry (Egyptian male): LXrTqFIgiubkrMkwvOUr  
- Farah (Arabic female): 4wf10lgibMnboGJGCLrP
- Rayyan (Saudi male): FjJJxwBrv1I5sk34AdgP
- Abdullah (MSA male): pCKbQ4EPGE06zpEPGNvS
```
