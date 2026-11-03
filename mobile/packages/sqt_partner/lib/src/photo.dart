import 'package:image_picker/image_picker.dart';
import 'package:sqt_core/sqt_core.dart';

/// Chụp ảnh bằng camera và tải lên máy chủ; trả về đường dẫn ảnh, hoặc null nếu người dùng huỷ.
/// Ảnh được thu nhỏ để tiết kiệm dữ liệu di động.
Future<String?> takeAndUploadPhoto(ApiClient api) async {
  final shot = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1600, imageQuality: 70);
  if (shot == null) return null;
  final res = await api.upload('/v1/uploads', await shot.readAsBytes(), filename: 'photo.jpg', contentType: 'image/jpeg');
  return res['url'] as String;
}
