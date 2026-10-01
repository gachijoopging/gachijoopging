import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export async function mediaFile(uri: string): Promise<{ uri: string; name: string; type: string }> {
  const context = ImageManipulator.manipulate(uri);
  let image;
  try {
    image = await context.renderAsync();
    if (Math.max(image.width, image.height) > 2048) {
      context.resize(image.width >= image.height ? { width: 2048 } : { height: 2048 });
      image.release();
      image = await context.renderAsync();
    }
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: result.uri, name: 'photo.jpg', type: 'image/jpeg' };
  } finally {
    image?.release();
    context.release();
  }
}
