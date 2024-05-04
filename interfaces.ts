export enum ResourceType {
  Artist = 'artist',
  Album = 'album',
  Playlist = 'playlist'
}

export enum VideoShape {
  Tall = 'tall',
  Square = 'square'
}

export interface IArguments {
  shape: string;
  loops: number;
  url: string;
}

export interface IResourceInfo {
  id: string;
  name: string;
  type: string;
  country: string;
}

export interface IResourceData {
  data: IResourceItem[];
}

export interface IResourceItem {
  id: string;
  type: string;
  href: string;
  attributes: IResourceAttributes;
}

export interface IResourceAttributes {
  copyright: string;
  genreNames: string[];
  releaseDate: string;
  lastModifiedDate: string;
  editorialVideo: IEditorialVideo;
  artwork: any;
  name: string;
  artistName: string;
  url: string;
  trackCount: number;
  upc: string;
  contentRating: string;
  recordLabel: string;
  editorialNotes: any;
}

export interface IEditorialVideo {
  motionSquareVideo1x1: IVideo;
  motionArtistWide16x9: IVideo;
  motionDetailTall: IVideo;
  motionArtistSquare1x1: IVideo;
  motionDetailSquare: IVideo;
  motionArtistFullscreen16x9: IVideo;
}

export interface IVideo {
  previewFrame: any;
  video: any;
}

export interface IM3u8Manifest {
  playlists: IM3uPlaylist[];
}

export interface IM3uPlaylist {
  attributes: IM3uPlaylistAttributes;
  uri: string;
}

export interface IM3uPlaylistAttributes {
  RESOLUTION: IResolution;
  CODECS: string;
  BANDWIDTH: number;
  'FRAME-RATE': number;
}

export interface IResolution {
  width: number;
  height: number;
}