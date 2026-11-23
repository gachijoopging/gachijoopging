const mockResize = jest.fn();
const mockRelease = jest.fn();
const mockSave = jest.fn().mockResolvedValue({ uri: 'compressed.jpg' });
const mockRender = jest.fn();
const mockJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get name() { return this.uri.split('/').pop(); }
    get type() { return this.uri.endsWith('.jpg') ? 'image/jpeg' : null; }
    async bytes() { return mockJpegBytes; }
  },
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: () => ({ resize: mockResize, renderAsync: mockRender, release: mockRelease }) } }));
import { mediaFile } from './media';
beforeEach(() => { jest.clearAllMocks(); });
test.each([[4000, 3000, { width: 2048 }], [3000, 4000, { height: 2048 }]])('large image %i×%i keeps its aspect ratio and uploads JPEG85', async (width, height, dimensions) => {
  mockRender.mockResolvedValue({ width, height, saveAsync: mockSave, release: mockRelease });
  await expect(mediaFile('original.png')).resolves.toMatchObject({ uri: 'compressed.jpg' });
  expect(mockResize).toHaveBeenCalledWith(dimensions);
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.85 });
  expect(mockRelease).toHaveBeenCalledTimes(3);
});
test('small images are not enlarged', async () => {
  mockRender.mockResolvedValue({ width: 640, height: 480, saveAsync: mockSave, release: mockRelease });
  await mediaFile('small.png');
  expect(mockResize).not.toHaveBeenCalled();
});
test('Expo fetch 가 업로드 본문을 직렬화하면 파일 이름·content-type·JPEG 바이트가 든다', async () => {
  const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
  const { convertFormDataAsync } = jest.requireActual('expo/src/winter/fetch/convertFormData');
  const ExpoFormData = installFormDataPatch(jest.requireActual('react-native/Libraries/Network/FormData').default);
  mockRender.mockResolvedValue({ width: 640, height: 480, saveAsync: mockSave, release: mockRelease });
  mockSave.mockResolvedValueOnce({ uri: 'file:///cache/ImageManipulator/9f1c.jpg' });
  const body = new ExpoFormData();
  body.append('file', await mediaFile('small.png'));
  const { body: bytes } = await convertFormDataAsync(body, '----B');
  expect(Buffer.from(bytes).toString('latin1')).toBe(
    '------B\r\ncontent-disposition: form-data; name="file"; filename="9f1c.jpg"\r\ncontent-type: image/jpeg\r\n\r\n\xff\xd8\xff\xe0\r\n------B--\r\n',
  );
});
