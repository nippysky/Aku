/**
 * UserAvatar
 *
 * Shows the user's profile photo if they have one (base64 data URI stored
 * in local SQLite), otherwise falls back to InitialsAvatar.
 *
 * Crash-safe by design:
 *  - Image.onError → flips to InitialsAvatar (bad/corrupt data URI won't crash)
 *  - Null/undefined avatarData → InitialsAvatar directly, no Image component rendered
 *  - All rendering is synchronous — no network, no loading state
 */
import React, { useState } from 'react';
import { Image, type ImageStyle, type ViewStyle } from 'react-native';
import { InitialsAvatar } from './InitialsAvatar';

// ─── Props ────────────────────────────────────────────────────────────────────

interface UserAvatarProps {
  name:        string;
  avatarData?: string | null;   // full data URI: "data:image/jpeg;base64,..."
  size?:       number;
  style?:      ViewStyle;        // applied to outer container (InitialsAvatar path)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UserAvatar({ name, avatarData, size = 48, style }: UserAvatarProps) {
  const [errored, setErrored] = useState(false);

  // No avatar or image failed to decode → show initials
  if (!avatarData || errored) {
    return <InitialsAvatar name={name} size={size} style={style} />;
  }

  const imageStyle: ImageStyle = {
    width:           size,
    height:          size,
    borderRadius:    size / 2,
    backgroundColor: '#2D6A4F',
  };

  return (
    <Image
      source={{ uri: avatarData }}
      style={imageStyle}
      onError={() => setErrored(true)}
      accessibilityLabel={`${name} profile photo`}
    />
  );
}

