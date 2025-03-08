import { Button } from '@/components/ui/button'
import { useState } from 'react'

type Avatar = {
  avatar_id: string
  avatar_name: string
  gender: string
  preview_image_url: string
  preview_video_url: string
}

interface AvatarGalleryProps {
  availableAvatars: Avatar[]
  selectedAvatar: string
  onSelectAvatar: (avatarId: string) => void
  onLoadAvatars: () => Promise<void>
}

export function AvatarGallery({ 
  availableAvatars, 
  selectedAvatar, 
  onSelectAvatar,
  onLoadAvatars 
}: AvatarGalleryProps) {
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false)

  const handleLoadAvatars = async () => {
    setIsLoadingAvatars(true)
    try {
      await onLoadAvatars()
    } finally {
      setIsLoadingAvatars(false)
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Available Avatars</h3>
        <Button
          variant="outline"
          onClick={handleLoadAvatars}
          disabled={isLoadingAvatars}
        >
          {isLoadingAvatars ? 'Loading...' : 'Load Avatars'}
        </Button>
      </div>
      
      {availableAvatars.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {availableAvatars
            .filter(avatar => 'avatar_name' in avatar)
            .map((avatar) => (
              <div 
                key={avatar.avatar_id}
                className={`relative cursor-pointer rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all ${
                  selectedAvatar === avatar.avatar_id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onSelectAvatar(avatar.avatar_id)}
              >
                <img 
                  src={avatar.preview_image_url}
                  alt={avatar.avatar_name}
                  className="w-full aspect-square object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2">
                  <p className="text-white text-sm truncate">{avatar.avatar_name}</p>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Click 'Load Avatars' to view available avatars</p>
      )}
    </div>
  )
}