ALTER TABLE lavados
  ADD CONSTRAINT chk_lavados_precio_positive CHECK (precio > 0)