import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// expo/fetch 의 FormData 는 RN 식 { uri, name, type } 파트를 받지 않는다. bytes() 를 가진 File 이어야 올라간다
export async function mediaFile(uri: string): Promise<File> {
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
    return new File(result.uri);
  } finally {
    image?.release();
    context.release();
  }
}
