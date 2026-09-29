var turnosServices = angular.module('turnoServices', ['app.services']);

turnosServices.factory('turno', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/turnos', true, {
			obtenerTurnos: { method: 'GET', url: 'api/turnos/:registroSeccional/:esMandatario/:cuitSolicita', params: { registroSeccional: '@registroSeccional', esMandatario: '@esMandatario', cuitSolicita: '@cuitSolicita' } },
			obtenerTurnosEstadistica: { method: 'GET', url: 'api/turnos/estadistica/:cuitSolicita', params: { cuitSolicita: '@cuitSolicita' } }
	    });
	}]);
