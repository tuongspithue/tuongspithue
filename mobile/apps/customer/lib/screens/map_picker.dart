import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:sqt_core/sqt_core.dart';

/// Chọn vị trí bằng cách kéo bản đồ cho ghim nằm đúng chỗ (nền OpenStreetMap miễn phí, không cần khoá API).
class MapPickerScreen extends StatefulWidget {
  const MapPickerScreen({super.key, required this.initial, required this.title});
  final LatLng initial;
  final String title;

  @override
  State<MapPickerScreen> createState() => _MapPickerScreenState();
}

class _MapPickerScreenState extends State<MapPickerScreen> {
  final _map = MapController();
  late LatLng _center = widget.initial;

  Future<void> _myLocation() async {
    final p = await currentPosition(onError: (r) => showDone(context, r));
    if (p == null) return;
    _map.move(LatLng(p.lat, p.lng), 17);
    setState(() => _center = LatLng(p.lat, p.lng));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.title)),
        body: Stack(children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: widget.initial,
              initialZoom: 16,
              onPositionChanged: (camera, _) => setState(() => _center = camera.center),
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                maxZoom: 19,
                userAgentPackageName: 'vn.shipquanhtoi.customer',
              ),
              const RichAttributionWidget(attributions: [TextSourceAttribution('© OpenStreetMap')]),
            ],
          ),
          // Ghim cố định giữa màn hình: kéo bản đồ để chọn điểm.
          const IgnorePointer(
            child: Center(
              child: Padding(padding: EdgeInsets.only(bottom: 44), child: Icon(Icons.location_on, size: 48, color: SqtColors.primary)),
            ),
          ),
          Positioned(
            right: 16,
            top: 16,
            child: FloatingActionButton.small(heroTag: 'me', onPressed: _myLocation, tooltip: 'Vị trí của tôi', child: const Icon(Icons.my_location)),
          ),
        ]),
        bottomNavigationBar: SafeArea(
          minimum: const EdgeInsets.all(16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Kéo bản đồ để ghim nằm đúng điểm, rồi bấm xác nhận'),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(key: const Key('confirm-point'), onPressed: () => Navigator.pop(context, _center), child: const Text('Xác nhận điểm này')),
            ),
          ]),
        ),
      );
}
