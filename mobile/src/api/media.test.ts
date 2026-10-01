const mockResize = jest.fn();
const mockRelease = jest.fn();
const mockSave = jest.fn().mockResolvedValue({ uri: 'compressed.jpg' });
const mockRender = jest.fn();
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: () => ({ resize: mockResize, renderAsync: mockRender, release: mockRelease }) } }));
import { mediaFile } from './media';
beforeEach(() => { jest.clearAllMocks(); });
test.each([[4000, 3000, { width: 2048 }], [3000, 4000, { height: 2048 }]])('large image %i×%i keeps its aspect ratio and uploads JPEG85', async (width, height, dimensions) => {
  mockRender.mockResolvedValue({ width, height, saveAsync: mockSave, release: mockRelease });
  await expect(mediaFile('original.png')).resolves.toEqual({ uri: 'compressed.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  expect(mockResize).toHaveBeenCalledWith(dimensions);
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.85 });
  expect(mockRelease).toHaveBeenCalledTimes(3);
});
test('small images are not enlarged', async () => {
  mockRender.mockResolvedValue({ width: 640, height: 480, saveAsync: mockSave, release: mockRelease });
  await mediaFile('small.png');
  expect(mockResize).not.toHaveBeenCalled();
});
