import { createElement } from 'lucide';
import {
 Reply, X, Volume2, VolumeX, Search, Trash2, Mail, Ban, UserX, Folder, Paperclip, Bell, Image, Music, FileText, Settings
} from 'lucide';

const iconMap = {
    'user-x': UserX,
    'reply': Reply,
    'trash-2': Trash2,
    'ban': Ban,
    'image': Image,
    'file-text': FileText,
    'paperclip': Paperclip,
    'x': X,
    'settings': Settings,
    'volume-2': Volume2,
    'volume-x': VolumeX,
    'search': Search,
    'mail': Mail,
    'folder': Folder,
    'bell': Bell,
    'music': Music,
};


// Returns an SVG string for the given icon name
export function createIconHTML(iconName, options = {}) {
  const icon = iconMap[iconName];
  if (!icon) return '';
  // Optionally set width/height/class
  const attrs = {
    width: options.size || 16,
    height: options.size || 16,
    ...options.attrs,
  };
  if (options.class) {
    attrs.class = options.class;
  }
  // Create the DOM SVG element (not string)
  const svg = createElement(icon, attrs);

  // Serialize to string for innerHTML
  // (modern browsers: use outerHTML; for older, insert and use innerHTML of a container)
  return svg.outerHTML;
}
