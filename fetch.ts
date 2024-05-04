/// <reference types="node" />

import { readFileSync, existsSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { IArguments, IM3u8Manifest, IM3uPlaylist, IResourceAttributes, IResourceData, IResourceInfo, ResourceType, VideoShape } from './interfaces';
import { Parser } from 'm3u8-parser';
import { printTable } from 'console-table-printer';
import { buildPath, createDirectory, httpGet, runCommand } from './utilities';
import { RequestOptions } from 'https';

const tokenFileName = 'token.txt';
const ffmpegFileName = 'ffmpeg.exe';
const videoExtension = '.mp4';
const videoFileName = 'video' + videoExtension;
const loopFileName = 'loop' + videoExtension;
const appleApiUrl = 'https://amp-api.music.apple.com/v1/catalog';
const tokenCheckUrl = buildApiUrl('in', ResourceType.Album, '1551901062');
const appleRequestOrigin = 'https://music.apple.com';
const tokenRetrieveUrl = appleRequestOrigin + '/us/album/positions-deluxe/1553944254';
const tokenStart = 'eyJhbGc';
const animatedFolder = 'animated';
let token = '';

(async () => {
  try {
    await main();
  }
  catch (err) {
    console.log(err);
  }
})();

async function main() {
  const args = getArgs();
  const resourceInfo = getResourceInfo(args.url);
  await setupToken();
  createDirectory(animatedFolder);

  switch (resourceInfo.type) {
    case ResourceType.Album:
      await downloadAlbumVideo(resourceInfo.id, resourceInfo.country, args.shape, args.loops);
      break;
    case ResourceType.Artist:
      await downloadArtistVideo(resourceInfo.id, resourceInfo.country, args.shape, args.loops);
      break;
    case ResourceType.Playlist:
      await downloadPlaylistVideo(resourceInfo.id, resourceInfo.country, args.shape, args.loops);
      break;
  }
}

async function setupToken(): Promise<void> {
  let isTokenValid = false;
  const tokenFilePath = buildPath(tokenFileName);
  if (existsSync(tokenFilePath)) {
    const fileBuffer = readFileSync(tokenFilePath);
    const fileToken = fileBuffer.toString();
    if (fileToken) {
      token = fileToken;
      const tokenCheckResponse = await httpGet(tokenCheckUrl, buildApiOptions());
      if (tokenCheckResponse.statusCode === 200) {
        isTokenValid = true;
        console.log('File token valid.');
      }
      else {
        console.log('File token invalid.');
      }
    }
  }

  if (!isTokenValid) {
    token = await retrieveToken();
    writeFileSync(tokenFilePath, token);
    console.log('Token updated.');
  }
}

async function retrieveToken(): Promise<string> {
  const tokenRetrieveResponse = await httpGet(tokenRetrieveUrl, {});
  const crossOriginRegExp = new RegExp('crossorigin src="(/assets/index.+?\.js)"', 'g');
  const crossOriginRegExpResult = tokenRetrieveResponse.text.match(crossOriginRegExp)[0] as string;
  const crossOriginJsPath = crossOriginRegExpResult.replace('crossorigin src="', '').replace('"', '');
  const crossOriginJsResponse = await httpGet(appleRequestOrigin + crossOriginJsPath, {});
  const tokenRegExp = new RegExp(`(${tokenStart}.+?)"`);
  const tokenRegExpResult = crossOriginJsResponse.text.match(tokenRegExp)[0] as string;
  return tokenRegExpResult.replace('"', '');
}

function getArgs(): IArguments {
  return {
    shape: process.argv[2],
    loops: parseInt(process.argv[3], 10),
    url: process.argv[4]
  };
}

function getResourceInfo(url: string): IResourceInfo {
  const splitResult = url.split('/');
  return {
    id: splitResult[6],
    name: splitResult[5],
    type: splitResult[4],
    country: splitResult[3]
  };
}

async function downloadAlbumVideo(resourceId: string, country: string, shape: string, loops: number): Promise<void> {
  await downloadVideo(resourceId, ResourceType.Album, country, shape, loops,
    attributes => {
      return `${attributes.artistName} - ${attributes.name} (${attributes.releaseDate.substring(0, 4)})`;
    }
  );
}

async function downloadArtistVideo(resourceId: string, country: string, shape: string, loops: number): Promise<void> {
  await downloadVideo(resourceId, ResourceType.Artist, country, shape, loops,
    attributes => {
      return attributes.name;
    }
  );
}

async function downloadPlaylistVideo(resourceId: string, country: string, shape: string, loops: number): Promise<void> {
  await downloadVideo(resourceId, ResourceType.Playlist, country, shape, loops,
    attributes => {
      return `${attributes.name} (${attributes.lastModifiedDate.substring(0, 4)})`;
    }
  );
}

async function downloadVideo(
  resourceId: string,
  resourceType: ResourceType,
  country: string,
  shape: string,
  loops: number,
  getFileNameFn: (attributes: IResourceAttributes) => string
): Promise<void> {
  // Get resource data to create file name
  const url = buildApiUrl(country, resourceType, resourceId);
  const resourceResponse = await httpGet(url, buildApiOptions());
  const resourceData = JSON.parse(resourceResponse.text) as IResourceData;
  const attributes = resourceData.data[0].attributes;
  const name = getFileNameFn(attributes);
  const sanitize = require('sanitize-filename');
  const finalVideoName = sanitize(name) + videoExtension;
  const finalVideoPath = buildPath(animatedFolder, finalVideoName);

  // Use resource data to retrieve and display video options
  const m3u8 = getM3u8(resourceData, shape, resourceType);
  const videoResponse = await httpGet(m3u8, {});
  const parser = new Parser();
  parser.push(videoResponse.text);
  parser.end();
  const manifest = parser.manifest as IM3u8Manifest;
  printPlaylistTable(manifest.playlists);

  // Prompt user for the video option
  const readlineSync = require('readline-sync');
  const selectionId = readlineSync.question('Enter Id: ');

  // Download the video
  const uri = manifest.playlists[parseInt(selectionId, 10)].uri;
  const ffmpegPath = buildPath(ffmpegFileName);
  console.log('Downloading video...');
  const videoPath = buildPath(videoFileName);
  const createVideoCommand = `-loglevel quiet -y -i ${uri} -c copy "${videoPath}"`;
  await runCommand(`"${ffmpegPath}" ${createVideoCommand}`);

  // Add loops if needed
  if (loops) {
    console.log('Adding video loops...');
    const loopPath = buildPath(loopFileName);
    const loopVideoCommand = `-loglevel quiet -y -stream_loop ${loops} -i ${videoFileName} -c copy "${loopPath}"`;
    await runCommand(`"${ffmpegPath}" ${loopVideoCommand}`);
    renameSync(loopPath, finalVideoPath);
    unlinkSync(videoPath);
  }
  else {
    renameSync(videoPath, finalVideoPath);
  }

  console.log('Video ready.');
}

function printPlaylistTable(playlists: IM3uPlaylist[]): void {
  const rows: any[] = [];

  for (const playlist of playlists) {
    rows.push({
      Id: rows.length,
      Resolution: `${playlist.attributes.RESOLUTION.height}x${playlist.attributes.RESOLUTION.width}`,
      Bitrate: `${Math.round(playlist.attributes.BANDWIDTH / 10000) / 100} Mb/s`,
      Codec: playlist.attributes.CODECS.substring(0, 4),
      Fps: playlist.attributes['FRAME-RATE']
    });
  }
  printTable(rows);
}

function getM3u8(resourceData: IResourceData, shape: string, type: ResourceType): string {
  const video = resourceData.data[0].attributes.editorialVideo;
  if (shape === VideoShape.Tall) {
    if (type === ResourceType.Artist) {
      if (video?.motionArtistFullscreen16x9?.video) {
        return video.motionArtistFullscreen16x9.video
      }
      return video.motionArtistWide16x9.video;
    }
    return video.motionDetailTall.video;
  }

  if (shape === VideoShape.Square) {
    if (type === ResourceType.Artist) {
      if (video?.motionArtistSquare1x1?.video) {
        return video.motionArtistSquare1x1.video;
      }
      return video.motionDetailSquare.video;
    }
    return video.motionSquareVideo1x1.video;
  }

  throw new Error('Unhandled video shape: ' + shape);
}

function buildApiUrl(country: string, type: string, id: string): string {
  return `${appleApiUrl}/${country}/${type}s/${id}?extend=editorialVideo`;
}

function buildApiOptions(): RequestOptions {
 return { headers: { authorization: 'Bearer ' + token, origin: appleRequestOrigin } }; 
}