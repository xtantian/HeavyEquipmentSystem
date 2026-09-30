export type EquipmentAvailability = "Available" | "Reserved" | "Maintenance";

export interface EquipmentSpec {
  label: string;
  value: string;
}

export interface EquipmentRate {
  daily: number;
  weekly: number;
  unit: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  model: string;
  category: string;
  categoryId: string;
  image: string;
  description: string;
  specs: EquipmentSpec[];
  rate: EquipmentRate;
  availability: EquipmentAvailability;
  powerSource: string;
  operatingWeight: string;
  suitableProjects: string[];
}

export interface EquipmentCategory {
  id: string;
  name: string;
  description: string;
  iconName: string;
  machineCount: number;
}

export interface HowItWorksStep {
  step: string;
  title: string;
  description: string;
  detail: string;
  iconName: string;
}

export interface BenefitItem {
  title: string;
  description: string;
  tag: string;
  iconName: string;
}
