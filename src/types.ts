export type WellStatus = 'not_installed' | 'installed' | 'needs_followup' | 'completed' | 'inactive'
export type MissionStatus = 'planned' | 'in_progress' | 'done' | 'cancelled'
export interface City { id:string; name:string; description:string; createdAt:string }
export interface MediaItem { id:string; name:string; type:'photo'|'audio'|'receipt'|'screenshot'|'invoice'; url?:string; dataUrl?:string; storagePath?:string; createdAt:string; duration?:number; ownerId?:string }
export interface InstallSnapshot { id:string; type:'installation'|'visit'; wellId:string; date:string; createdAt:string; latitude?:number; longitude?:number; accuracy?:number; pipeMaterial:string; pipeDiameter?:number; pipeThickness?:number; liningThickness?:number; signalQuality?:number; signalPower?:number; soundPath?:'Z'|'V'; transmitterSerial:string; sensorSerial:string; flow?:number; notes:string; photos:MediaItem[]; voices:MediaItem[]; followUp?:boolean }
export interface Well { id:string; cityId:string; name:string; code:string; status:WellStatus; createdAt:string; location?:{latitude:number;longitude:number;accuracy?:number} }
export interface Meal { id:string; missionId:string; title:string; amount:number; vendor:string; notes:string; files:MediaItem[] }
export interface TravelSegment { id:string; missionId:string; origin:string; destination:string; vehicle:string; amount:number; dateTime:string; notes:string; files:MediaItem[] }
export interface OtherExpense { id:string; missionId:string; title:string; amount:number; notes:string; files:MediaItem[] }
export interface Mission { id:string; date:string; cityId:string; title:string; notes:string; startTime:string; endTime:string; status:MissionStatus; wellIds:string[]; meal?:Meal; travel:TravelSegment[]; otherExpenses:OtherExpense[]; files:MediaItem[]; createdAt:string }
export interface AppData { cities:City[]; wells:Well[]; snapshots:InstallSnapshot[]; missions:Mission[]; theme:'light'|'dark' }
