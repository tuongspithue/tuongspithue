import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ALLERGENS } from '@sqt/domain';

export class OrderItemDto {
  @IsInt() itemId!: number;
  @IsInt() @Min(1) @Max(50) quantity!: number;
  /** Ghi chú tự do cho món (Phần 2.1.4a). Độ dài kiểm tra sau khi lọc SĐT/link ở gói domain. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @Length(1, 40, { each: true }) noteTags?: string[];
  @IsOptional() @IsArray() @IsIn(ALLERGENS as unknown as string[], { each: true }) allergens?: string[];
  @IsOptional() @IsIn(['CONTACT_ME', 'SIMILAR_OK', 'REMOVE']) substitutionPolicy?: string;
}

export class DropoffDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @Length(5, 300) address!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class RecipientDto {
  @Length(1, 120) name!: string;
  @Matches(/^0\d{9}$/) phone!: string;
}

export class ScheduleDto {
  /** PICKUP: giờ lấy hàng tại quán; DELIVERY: giờ khách muốn nhận (Phần 10.2). */
  @IsIn(['PICKUP', 'DELIVERY']) type!: 'PICKUP' | 'DELIVERY';
  @IsISO8601() at!: string;
}

export class CreateOrderDto {
  @IsInt() storeId!: number;
  @IsIn(['PLATFORM', 'SELF_PICKUP']) deliveryMode!: 'PLATFORM' | 'SELF_PICKUP';
  /** MVP: tiền mặt, VietQR, MoMo (Phần 2.1.5). */
  @IsIn(['COD', 'VIETQR', 'MOMO']) paymentMethod!: 'COD' | 'VIETQR' | 'MOMO';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
  @IsOptional() @ValidateNested() @Type(() => DropoffDto) dropoff?: DropoffDto;
  @IsOptional() @ValidateNested() @Type(() => RecipientDto) recipient?: RecipientDto;
  @IsOptional() @IsString() @MaxLength(400) orderNote?: string;
  @IsOptional() @ValidateNested() @Type(() => ScheduleDto) schedule?: ScheduleDto;
}

export class ProxyOrderedDto {
  @IsOptional() @IsBoolean() allergyAck?: boolean;
}

export class ProxyPurchasedDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  /** Tiền món thật trả cho quán. */
  @IsInt() @Min(0) @Max(20_000_000) amount!: number;
  @IsOptional() @IsString() @MaxLength(500) receiptUrl?: string;
  /** Giá lệch quá ngưỡng: shipper đã gọi và khách đồng ý. */
  @IsOptional() @IsBoolean() customerAgreed?: boolean;
}

/** Báo giá giỏ hàng: như đặt đơn nhưng chưa cần cách thanh toán. */
export class QuoteOrderDto {
  @IsInt() storeId!: number;
  @IsIn(['PLATFORM', 'SELF_PICKUP']) deliveryMode!: 'PLATFORM' | 'SELF_PICKUP';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
  @IsOptional() @ValidateNested() @Type(() => DropoffDto) dropoff?: DropoffDto;
}

export class ProposeTimeDto {
  @IsISO8601() at!: string;
  @IsInt() @IsIn([5, 10, 15, 20, 30, 45, 60]) prepTimeMin!: number;
  @IsOptional() @IsBoolean() allergyAck?: boolean;
}

export class ProposalResponseDto {
  @IsBoolean() accept!: boolean;
}

export class MerchantAcceptDto {
  @IsInt() @IsIn([5, 10, 15, 20, 30, 45, 60]) prepTimeMin!: number;
  /** Bắt buộc true nếu đơn có ghi chú dị ứng. */
  @IsOptional() @IsBoolean() allergyAck?: boolean;
}

export class ReasonDto {
  @Length(2, 60) reason!: string;
}

export class CodeDto {
  @Length(4, 12) code!: string;
}

export class LocationDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
}

export class StepDto extends LocationDto {
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

export class PickupDto extends LocationDto {
  @Length(4, 12) code!: string;
}

export class DeliveredDto {
  @IsOptional() @Matches(/^\d{4}$/) pin?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

export class RiderStatusDto {
  @IsBoolean() online!: boolean;
  @IsOptional() @IsLatitude() lat?: number;
  @IsOptional() @IsLongitude() lng?: number;
}

export class RiderRegisterDto {
  @IsIn(['MOTORBIKE', 'EMOTORBIKE', 'CARGO']) vehicleType!: string;
  @IsOptional() @Length(4, 20) plateNumber?: string;
}
