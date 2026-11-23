package site.gachijoopging.server.domain.activity.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record AddItemsRequest(UUID photoId, @NotEmpty List<@NotNull @Valid ItemInput> items) {}
