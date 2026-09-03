# WatchBee for Vmix
A lightweight utility that automatically manages vMix playlists by monitoring a folder for file changes. When video files are added, removed, or modified in the watched folder, the tool automatically updates the corresponding vMix playlist.

## Features

- Automatically adds new video files to a vMix playlist
- Removes files from the playlist when deleted from the watched folder
- Updates playlist when files are modified
- Handles file renaming
- Configurable through a simple JSON file

## Installation

1. Download the latest release executable from the releases page
2. Place the executable in any folder where you have write permissions
3. Run the executable for the first time - it will create a default `config.json` file in the same directory

## Configuration

The tool uses a `config.json` file that will be automatically created in the same directory as the executable with these default settings:

```json
{
   "folderToWatch": ["./media", "./server2"],
   "playlistMap": {
      "./media": "MainPlaylist",
      "./server2": "BackupPlaylist"
   },
  "vmixUrl": "http://localhost:8088",
   "supportedExtensions": [".mp4", ".mov", ".wmv", ".avi", ".mpg", ".mpeg", ".mxf", ".mts"]
}
```

You can modify these settings:

- `folderToWatch`: The directory or directories to monitor (relative or absolute paths)
- `playlistMap` (optional): Maps a watched folder path to one playlist name or a list of playlist names
- `vmixUrl`: The URL where vMix API is accessible
- `supportedExtensions`: Array of supported video file extensions

Example: send the same folder to multiple playlists:

```json
{
   "folderToWatch": ["./media"],
   "playlistMap": {
      "./media": ["MainPlaylist", "BackupPlaylist", "HighlightsPlaylist"]
   },
   "vmixUrl": "http://localhost:8088",
   "supportedExtensions": [".mp4", ".mov", ".wmv", ".avi", ".mpg", ".mpeg", ".mxf", ".mts"]
}
```

You can also mix single-playlist and multi-playlist mappings:

```json
{
   "folderToWatch": ["./media", "./server2"],
   "playlistMap": {
      "./media": ["MainPlaylist", "BackupPlaylist"],
      "./server2": "Server2Playlist"
   },
   "vmixUrl": "http://localhost:8088",
   "supportedExtensions": [".mp4", ".mov", ".wmv", ".avi", ".mpg", ".mpeg", ".mxf", ".mts"]
}
```

Playlist name resolution order:
1. If the matched watched folder exists in `playlistMap`, all mapped playlist names are used.
2. If there is no mapped name, the watched folder's basename is used.
3. If the file path does not match any watched folder, fallback is the file's parent folder name.

When watched folders overlap (for example `./media` and `./media/news`), the most specific folder match is used.

## Usage

1. Make sure vMix is running and the API is accessible
2. Create playlists in vMix matching your folder basenames or `playlistMap` values
3. Run the executable
4. Add, remove, or modify video files in your watched folder - the tool will automatically update the vMix playlist

## Requirements

- vMix must be running and accessible via its API
- The watched folder must exist and be accessible
- The executable needs write permissions in its directory to create/update the config file

## Troubleshooting

Common issues and solutions:

1. **Playlist not updating**: 
   - Verify vMix is running
   - Check if the vMix API URL is correct in config.json
   - Ensure the playlist name matches exactly with the one in vMix
   - Check that the File path for the watcher and VMIX is the same when not using it on localhost.

2. **Files not being detected**:
   - Verify the watched folder path is correct
   - Check if the file extension is in the supported extensions list
   - Ensure the tool has read access to the watched directory

3. **Config file errors**:
   - Make sure the executable has write permissions in its directory
   - Verify the config.json format is valid JSON

## Technical Details

The tool:
- Uses the vMix API to manage playlists
- Monitors file system events using chokidar
- Supports both relative and absolute paths
- Handles file system events with debouncing to prevent duplicate operations
- Automatically creates a default configuration if none exists

## License

[MIT License](LICENSE)

## Contact
Please open an Issue for Feature Requests and Issues.

Developed with ❤️ by ByteHive